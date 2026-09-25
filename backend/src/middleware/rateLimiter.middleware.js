import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';
import { getLogger } from '../utils/logger.js';

const log = getLogger('rateLimiter.middleware');

const makeHandler = (message, limiterName) => (req, res, next) => {
  log.warn('rateLimiter: limit hit', { limiter: limiterName, method: req.method, path: req.path, ip: req.ip, userId: req.user?.id || null });
  next(new ApiError(429, message));
};

/**
 * General API rate limiter — 100 requests per 15 minutes.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many requests, please try again later.', 'global'),
});

/**
 * Strict limiter for auth routes — 10 attempts per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many login attempts, please try again after 15 minutes.', 'auth'),
});
