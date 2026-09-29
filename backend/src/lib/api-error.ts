export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ORDER_STATE_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'VOUCHER_ALREADY_EXISTS'
  | 'VOUCHER_NOT_FOUND'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_NOT_STARTED'
  | 'VOUCHER_USAGE_EXHAUSTED'
  | 'MIN_ORDER_VALUE_NOT_MET'
  | 'VOUCHER_INACTIVE'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_NOT_WORKING'
  | 'SHIFT_NOT_FOUND'
  | 'SHIFT_INACTIVE'
  | 'SCHEDULE_DATE_INVALID'
  | 'SCHEDULE_TIME_INVALID'
  | 'SCHEDULE_RECURRENCE_INVALID'
  | 'SCHEDULE_DUPLICATE'
  | 'SCHEDULE_OVERLAP'
  | 'SCHEDULE_IMPORT_FILE_INVALID'
  | 'SCHEDULE_IMPORT_FILE_TOO_LARGE'
  | 'SCHEDULE_IMPORT_FORMULA_NOT_ALLOWED'
  | 'SCHEDULE_IMPORT_ROW_LIMIT'
  | 'SCHEDULE_IMPORT_HEADERS_INVALID'
  | 'SCHEDULE_IMPORT_ROWS_INVALID'
  | 'SCHEDULE_IMPORT_EMPTY'
  | 'ATTENDANCE_DATE_INVALID'
  | 'ATTENDANCE_REASON_REQUIRED'
  | 'KIOSK_SESSION_INVALID'
  | 'KIOSK_SESSION_EXPIRED'
  | 'KIOSK_SESSION_REVOKED'
  | 'ATTENDANCE_CREDENTIAL_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'ATTENDANCE_SESSION_ALREADY_OPEN'
  | 'NO_OPEN_ATTENDANCE_SESSION'
  | 'MULTIPLE_OPEN_ATTENDANCE_SESSIONS'
  | 'SCHEDULE_SELECTION_REQUIRED'
  | 'SCHEDULE_NOT_AVAILABLE'
  | 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED'
  | 'ATTENDANCE_BRANCH_MISMATCH'
  | 'ATTENDANCE_SESSION_NOT_FOUND'
  | 'ATTENDANCE_OCCURRENCE_ALREADY_RECORDED'
  | 'ATTENDANCE_ABSENCE_ALREADY_CONFIRMED'
  | 'ATTENDANCE_SHIFT_NOT_ENDED'
  | 'ATTENDANCE_DISPOSITION_NOT_FOUND'
  | 'ATTENDANCE_DISPOSITION_HAS_NO_SESSION'
  | 'ATTENDANCE_DISPOSITION_ALREADY_REVOKED';

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

  static notFound(message = 'Tai nguyen yeu cau khong ton tai', code: ErrorCode = 'NOT_FOUND', details?: Record<string, string>) {
    return new ApiError(404, code, message, details);
  }

  static conflict(message: string, code: ErrorCode = 'CONFLICT', details?: Record<string, string>) {
    return new ApiError(409, code, message, details);
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
