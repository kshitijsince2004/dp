/**
 * Custom API error class. Extends native Error with statusCode + details.
 *
 * Usage:
 *   throw new ApiError(404, 'User not found');
 *   throw new ApiError(422, 'Validation failed', validationErrors);
 */
export class ApiError extends Error {
  constructor(statusCode, message = 'Something went wrong', errors = [], stack = '') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
    this.timestamp = new Date().toISOString();

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
