import slugifyLib from 'slugify';

/**
 * Generate a URL-friendly slug from a string.
 * @param {string} text
 * @param {string} [suffix] - Optional suffix (e.g., an ID) to ensure uniqueness
 */
export const slugify = (text, suffix = '') => {
  const base = slugifyLib(text, { lower: true, strict: true, trim: true });
  return suffix ? `${base}-${suffix}` : base;
};

/**
 * Build pagination metadata for list responses.
 * @param {number} total - Total records in DB
 * @param {number} page  - Current page (1-indexed)
 * @param {number} limit - Items per page
 */
export const paginate = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Parse and sanitize pagination query params.
 * @param {object} query - req.query
 */
export const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Pick only the allowed keys from an object (safe update payloads).
 * @param {object} obj
 * @param {string[]} keys
 */
export const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
    return acc;
  }, {});

/**
 * Remove undefined/null keys from an object.
 * @param {object} obj
 */
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

/**
 * Delay execution (useful for testing / backoff).
 * @param {number} ms
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate a random integer in [min, max].
 */
export const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Capitalize first letter of a string.
 */
export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
