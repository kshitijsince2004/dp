import bcrypt from 'bcryptjs';
import db from '../../config/db.js';
import { env } from '../../config/env.js';
import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';
import {
  buildAccessPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/generateToken.js';

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
  if (redisClient) {
    try {
      await redisClient.set(`refresh:${userId}`, token, 'EX', 7 * 24 * 60 * 60);
      return;
    } catch (e) {
      logger.warn('[Redis] Failed to set token. Falling back to memory.');
    }
  }
  memoryTokenCache.set(userId, token);
}

async function getRefreshToken(userId) {
  if (redisClient) {
    try {
      return await redisClient.get(`refresh:${userId}`);
    } catch (e) {
      logger.warn('[Redis] Failed to get token. Falling back to memory.');
    }
  }
  return memoryTokenCache.get(userId);
}

async function removeRefreshToken(userId) {
  if (redisClient) {
    try {
      await redisClient.del(`refresh:${userId}`);
      return;
    } catch (e) {
      logger.warn('[Redis] Failed to delete token. Falling back to memory.');
    }
  }
  memoryTokenCache.delete(userId);
}

/**
 * Backfill missing scope FKs by climbing the hierarchy.
 * Chain is HQ → ZONE → RANGE → DISTRICT → SUB_DIV → PS, so a PS's parent is
 * its SUB_DIV and the district is TWO hops up — never assume ps.parent is the
 * district. Seeds populate all three columns; this is a safety net for
 * hand-created users.
 */
export async function resolveScope(user) {
  const scope = {
    ps_id: user.ps_id || null,
    sub_div_id: user.sub_div_id || null,
    district_id: user.district_id || null,
  };
  if (scope.ps_id && !scope.sub_div_id) {
    const ps = await db('hierarchy_nodes').where({ id: scope.ps_id }).first();
    scope.sub_div_id = ps?.parent_id || null;
  }
  if (scope.sub_div_id && !scope.district_id) {
    const subDiv = await db('hierarchy_nodes').where({ id: scope.sub_div_id }).first();
    scope.district_id = subDiv?.parent_id || null;
  }
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

  // Exact match first — a real username/badge always wins over alias guessing,
  // so a seeded username that happens to contain an alias keyword (e.g.
  // "dcp_nwd" containing "dcp") never gets silently hijacked into the wrong
  // account.
  let user = await findByBadgeOrUsername(normalizedBadgeNo);

  if (!user && isDev) {
    const alias = DEV_BADGE_ALIASES.find(([re]) => re.test(normalizedBadgeNo.toLowerCase()));
    if (alias) user = await findByBadgeOrUsername(alias[1]);
  }

  if (!user) {
    throw new Error('Invalid badge number or password');
  }

  if (!user.is_active) {
    throw new Error('User account is deactivated');
  }

  let isMatch = await bcrypt.compare(password, user.password_hash);
  // Dev-only backdoor: the seeded dev passwords are interchangeable.
  if (!isMatch && isDev && ['Password123', 'test123', 'Test@1234'].includes(password)) {
    for (const p of ['Password123', 'test123', 'Test@1234']) {
      if (p !== password) {
        isMatch = await bcrypt.compare(p, user.password_hash);
        if (isMatch) break;
      }
    }
  }

  if (!isMatch) {
    throw new Error('Invalid badge number or password');
  }

  // Backfill any missing scope ids from the hierarchy before building the token
  const scope = await resolveScope(user);
  const payload = buildAccessPayload({ ...user, ...scope });

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  await storeRefreshToken(user.id, refreshToken);
  await db('users').where({ id: user.id }).update({ last_login: new Date().toISOString() });

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
};

export const refreshUserToken = async (token) => {
  try {
    const decoded = verifyRefreshToken(token);
    const userId = decoded.sub ?? decoded.id; // decoded.id = pre-restructure tokens
    const savedToken = await getRefreshToken(userId);

    if (!savedToken || savedToken !== token) {
      throw new Error('Invalid refresh token');
    }

    // Re-query so role/scope/is_active changes take effect on the next token
    const user = await db('users').select(USER_COLUMNS).where({ id: userId }).first();
    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    const scope = await resolveScope(user);
    const newAccessToken = signAccessToken(buildAccessPayload({ ...user, ...scope }));
    return { access_token: newAccessToken };
  } catch (error) {
    throw new Error('Token refresh failed: ' + error.message);
  }
};

export const logoutUser = async (userId) => {
  await removeRefreshToken(userId);
};
