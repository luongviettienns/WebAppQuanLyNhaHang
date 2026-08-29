export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ORDER_STATE_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, string>;
  public readonly retryAfterSec?: number;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, string>,
    retryAfterSec?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfterSec = retryAfterSec;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: Record<string, string>, code: ErrorCode = 'VALIDATION_ERROR') {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Chua dang nhap hoac phien lam viec da het han', code: ErrorCode = 'UNAUTHENTICATED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'Ban khong co quyen thuc hien thao tac nay', code: ErrorCode = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Tai nguyen yeu cau khong ton tai', code: ErrorCode = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code: ErrorCode = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static orderStateInvalid(message: string) {
    return new ApiError(409, 'ORDER_STATE_INVALID', message);
  }

  static rateLimited(message = 'Ban da gui qua nhieu yeu cau. Vui long thu lai sau.', retryAfterSec = 60) {
    return new ApiError(429, 'RATE_LIMITED', message, undefined, retryAfterSec);
  }

  static internal(message = 'Da xay ra loi noi bo he thong. Vui long thu lai sau.') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
