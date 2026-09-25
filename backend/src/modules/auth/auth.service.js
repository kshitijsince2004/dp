import bcrypt from 'bcryptjs';
import db from '../../config/db.js';
import { env } from '../../config/env.js';
import Redis from 'ioredis';
import { logger, getLogger } from '../../utils/logger.js';
import {
  buildAccessPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/generateToken.js';

// STYLE ANCHOR: matches modules/records/records.service.js (logging-instrumentation-2026-07-22
// HANDOFF.md §7). Auth is the densest-logged module here per the brief — every login/refresh/
// logout step is traced. REDACTION IS MANDATORY: this file never logs a raw password,
// password_hash, access_token, or refresh_token value — only presence/booleans and, for the
// dev-only backdoor loop, never the literal candidate password strings even though they are
// hardcoded constants already visible in source.
const log = getLogger('auth.service');

let redisClient = null;
const memoryTokenCache = new Map();

try {
  if (env.REDIS_URL) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        // Stop retrying and fall back to memory
        if (times > 3) return null;
        return 1000;
      }
    });
    redisClient.on('error', (err) => {
      logger.warn('[Redis] Connection failed. Using memory fallback cache.');
      if (redisClient) {
        try {
          redisClient.disconnect();
        } catch (e) {}
      }
      redisClient = null;
    });
  }
} catch (e) {
  logger.warn('[Redis] Client initialization skipped. Using memory fallback.');
}

async function storeRefreshToken(userId, token) {
  log.debug('storeRefreshToken: enter', { userId, hasToken: !!token, backend: redisClient ? 'redis' : 'memory' });
  if (redisClient) {
    try {
      await redisClient.set(`refresh:${userId}`, token, 'EX', 7 * 24 * 60 * 60);
      log.debug('storeRefreshToken: stored in redis', { userId });
      return;
    } catch (e) {
      logger.warn('[Redis] Failed to set token. Falling back to memory.');
      log.warn('storeRefreshToken: redis set failed, falling back to memory', { userId, err: e });
    }
  }
  memoryTokenCache.set(userId, token);
  log.debug('storeRefreshToken: stored in memory cache', { userId });
}

async function getRefreshToken(userId) {
  log.debug('getRefreshToken: enter', { userId, backend: redisClient ? 'redis' : 'memory' });
  if (redisClient) {
    try {
      const val = await redisClient.get(`refresh:${userId}`);
      log.debug('getRefreshToken: read from redis', { userId, found: !!val });
      return val;
    } catch (e) {
      logger.warn('[Redis] Failed to get token. Falling back to memory.');
      log.warn('getRefreshToken: redis get failed, falling back to memory', { userId, err: e });
    }
  }
  const val = memoryTokenCache.get(userId);
  log.debug('getRefreshToken: read from memory cache', { userId, found: !!val });
  return val;
}

async function removeRefreshToken(userId) {
  log.debug('removeRefreshToken: enter', { userId, backend: redisClient ? 'redis' : 'memory' });
  if (redisClient) {
    try {
      await redisClient.del(`refresh:${userId}`);
      log.debug('removeRefreshToken: deleted from redis', { userId });
      return;
    } catch (e) {
      logger.warn('[Redis] Failed to delete token. Falling back to memory.');
      log.warn('removeRefreshToken: redis del failed, falling back to memory', { userId, err: e });
    }
  }
  memoryTokenCache.delete(userId);
  log.debug('removeRefreshToken: deleted from memory cache', { userId });
}

/**
 * Backfill missing scope FKs by climbing the hierarchy.
 * Chain is HQ → ZONE → RANGE → DISTRICT → SUB_DIV → PS, so a PS's parent is
 * its SUB_DIV and the district is TWO hops up — never assume ps.parent is the
 * district. Seeds populate all three columns; this is a safety net for
 * hand-created users.
 */
export async function resolveScope(user) {
  log.debug('resolveScope: enter', {
    userId: user?.id || null, psId: user?.ps_id || null,
    subDivId: user?.sub_div_id || null, districtId: user?.district_id || null,
  });
  const scope = {
    ps_id: user.ps_id || null,
    sub_div_id: user.sub_div_id || null,
    district_id: user.district_id || null,
  };
  if (scope.ps_id && !scope.sub_div_id) {
    const ps = await db('hierarchy_nodes').where({ id: scope.ps_id }).first();
    scope.sub_div_id = ps?.parent_id || null;
    log.debug('resolveScope: backfilled sub_div_id from ps parent', { psId: scope.ps_id, subDivId: scope.sub_div_id });
  }
  if (scope.sub_div_id && !scope.district_id) {
    const subDiv = await db('hierarchy_nodes').where({ id: scope.sub_div_id }).first();
    scope.district_id = subDiv?.parent_id || null;
    log.debug('resolveScope: backfilled district_id from sub_div parent', { subDivId: scope.sub_div_id, districtId: scope.district_id });
  }
  log.debug('resolveScope: exit', { userId: user?.id || null, scope });
  return scope;
}

const isDev = env.NODE_ENV === 'development';

// Dev-only login sugar: map memorable names/emails to seeded badge numbers.
const DEV_BADGE_ALIASES = [
  [/ramesh|hc001/, 'HC001'],
  [/vikram|sho001/, 'SHO001'],
  [/mahesh|acp001/, 'ACP001'],
  [/priya|do001|dcp/, 'DO001'],
  [/neha|hqa001|analyst/, 'HQA001'],
  [/rajiv|hqd001|hq_admin/, 'HQD001'],
  [/system|sa001/, 'SA001'],
];

const USER_COLUMNS = [
  'id', 'username', 'badge_no', 'name', 'password_hash', 'role',
  'ps_id', 'district_id', 'sub_div_id', 'is_active', 'last_login',
];

const findByBadgeOrUsername = async (value) => {
  const lower = value.toLowerCase();
  return (
    (await db('users').select(USER_COLUMNS).whereRaw('LOWER(badge_no) = ?', [lower]).first()) ||
    (await db('users').select(USER_COLUMNS).whereRaw('LOWER(username) = ?', [lower]).first())
  );
};

export const loginUser = async (badgeNo, password) => {
  const normalizedBadgeNo = String(badgeNo).trim();
  // NEVER log `password` itself — only that one was supplied (HANDOFF.md §3b redaction).
  log.debug('loginUser: enter', { badgeNo: normalizedBadgeNo, hasPassword: !!password });

  try {
    // Exact match first — a real username/badge always wins over alias guessing,
    // so a seeded username that happens to contain an alias keyword (e.g.
    // "dcp_nwd" containing "dcp") never gets silently hijacked into the wrong
    // account.
    let user = await findByBadgeOrUsername(normalizedBadgeNo);
    log.debug('loginUser: exact-match lookup', { badgeNo: normalizedBadgeNo, found: !!user, userId: user?.id || null, role: user?.role || null });

    if (!user && isDev) {
      const alias = DEV_BADGE_ALIASES.find(([re]) => re.test(normalizedBadgeNo.toLowerCase()));
      if (alias) {
        log.debug('loginUser: dev alias fallback matched', { badgeNo: normalizedBadgeNo, aliasTarget: alias[1] });
        user = await findByBadgeOrUsername(alias[1]);
        log.debug('loginUser: dev alias lookup', { aliasTarget: alias[1], found: !!user, userId: user?.id || null, role: user?.role || null });
      }
    }

    if (!user) {
      log.warn('loginUser: rejected — user not found', { badgeNo: normalizedBadgeNo });
      throw new Error('Invalid badge number or password');
    }

    if (!user.is_active) {
      log.warn('loginUser: rejected — user account deactivated', { userId: user.id, badgeNo: normalizedBadgeNo });
      throw new Error('User account is deactivated');
    }

    let isMatch = await bcrypt.compare(password, user.password_hash);
    log.debug('loginUser: password verify', { userId: user.id, ok: isMatch });
    // Dev-only backdoor: the seeded dev passwords are interchangeable. Never log the candidate
    // strings themselves, even though they're hardcoded dev constants — only that the backdoor
    // path engaged and its eventual outcome.
    if (!isMatch && isDev && ['Password123', 'test123', 'Test@1234'].includes(password)) {
      log.debug('loginUser: dev password-backdoor engaged', { userId: user.id });
      for (const p of ['Password123', 'test123', 'Test@1234']) {
        if (p !== password) {
          isMatch = await bcrypt.compare(p, user.password_hash);
          if (isMatch) break;
        }
      }
      log.debug('loginUser: dev password-backdoor outcome', { userId: user.id, ok: isMatch });
    }

    if (!isMatch) {
      log.warn('loginUser: rejected — password mismatch', { userId: user.id, badgeNo: normalizedBadgeNo });
      throw new Error('Invalid badge number or password');
    }

    // Backfill any missing scope ids from the hierarchy before building the token
    const scope = await resolveScope(user);
    const payload = buildAccessPayload({ ...user, ...scope });

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(user.id);
    // NEVER log the token values themselves — presence only.
    log.debug('loginUser: tokens issued', { userId: user.id, hasAccess: !!accessToken, hasRefresh: !!refreshToken });

    await storeRefreshToken(user.id, refreshToken);
    await db('users').where({ id: user.id }).update({ last_login: new Date().toISOString() });
    log.debug('loginUser: updated last_login', { userId: user.id });

    log.info('loginUser: success', { userId: user.id, badgeNo: user.badge_no, role: user.role, level: payload.level });
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        badge_no: user.badge_no,
        name: user.name,
        role: user.role,
        level: payload.level,
        ps_id: scope.ps_id,
        district_id: scope.district_id,
        sub_div_id: scope.sub_div_id,
      },
    };
  } catch (err) {
    log.error('loginUser: failed', { badgeNo: normalizedBadgeNo, err });
    throw err;
  }
};

export const refreshUserToken = async (token) => {
  // NEVER log the raw token value — presence/length only.
  log.debug('refreshUserToken: enter', { hasToken: !!token, tokenLen: token?.length || 0 });
  try {
    const decoded = verifyRefreshToken(token);
    const userId = decoded.sub ?? decoded.id; // decoded.id = pre-restructure tokens
    log.debug('refreshUserToken: token verified', { userId });

    const savedToken = await getRefreshToken(userId);
    const matches = !!savedToken && savedToken === token;
    log.debug('refreshUserToken: compared against stored token', { userId, hasSavedToken: !!savedToken, matches });
    if (!matches) {
      log.warn('refreshUserToken: rejected — token mismatch or not stored', { userId });
      throw new Error('Invalid refresh token');
    }

    // Re-query so role/scope/is_active changes take effect on the next token
    const user = await db('users').select(USER_COLUMNS).where({ id: userId }).first();
    log.debug('refreshUserToken: re-queried user', { userId, found: !!user, isActive: user?.is_active ?? null });
    if (!user || !user.is_active) {
      log.warn('refreshUserToken: rejected — user not found or inactive', { userId });
      throw new Error('User not found or inactive');
    }

    const scope = await resolveScope(user);
    const newAccessToken = signAccessToken(buildAccessPayload({ ...user, ...scope }));
    log.info('refreshUserToken: success', { userId, role: user.role, hasAccess: !!newAccessToken });
    return { access_token: newAccessToken };
  } catch (error) {
    log.error('refreshUserToken: failed', { err: error });
    throw new Error('Token refresh failed: ' + error.message);
  }
};

export const logoutUser = async (userId) => {
  log.debug('logoutUser: enter', { userId });
  await removeRefreshToken(userId);
  log.info('logoutUser: success', { userId });
};
