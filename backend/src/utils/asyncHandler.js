/**
 * Wraps async route handlers to eliminate repetitive try/catch blocks.
 *
 * Usage:
 *   router.get('/users', asyncHandler(UserController.getAll));
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
