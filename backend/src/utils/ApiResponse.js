/**
 * Standardized API success response wrapper.
 *
 * Usage:
 *   return res.status(200).json(new ApiResponse(200, data, 'Fetched successfully'));
 */
export class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }
}
