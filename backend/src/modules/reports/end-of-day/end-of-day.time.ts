import { ApiError } from '../../../lib/api-error';
import type { EndOfDayTimezone } from './end-of-day.types';

export const BUSINESS_TIMEZONE: EndOfDayTimezone = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BusinessWindow {
  from: Date;
  to: Date;
  timezone: EndOfDayTimezone;
}

export function isValidBusinessDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) return false;
  const timestamp = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === date;
}

export function currentBusinessDate(now = new Date()): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function resolveBusinessWindow(date: string, fromTime?: string, toTime?: string, timezone: string = BUSINESS_TIMEZONE): BusinessWindow {
  if (timezone !== BUSINESS_TIMEZONE) throw ApiError.badRequest('Múi giờ báo cáo phải là Asia/Ho_Chi_Minh');
  if (!isValidBusinessDate(date)) throw ApiError.badRequest('Ngày báo cáo không hợp lệ');
  if ((fromTime === undefined) !== (toTime === undefined)) throw ApiError.badRequest('Phải chọn cả giờ bắt đầu và giờ kết thúc');
  const midnight = new Date(`${date}T00:00:00.000Z`).getTime() - VIETNAM_OFFSET_MS;
  if (fromTime === undefined && toTime === undefined) {
    return { from: new Date(midnight), to: new Date(midnight + DAY_MS), timezone: BUSINESS_TIMEZONE };
  }
  const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!fromTime || !toTime || !clockPattern.test(fromTime) || !clockPattern.test(toTime)) {
    throw ApiError.badRequest('Giờ báo cáo phải có định dạng HH:mm');
  }
  if (fromTime >= toTime) throw ApiError.badRequest('Giờ bắt đầu phải trước giờ kết thúc trong cùng ngày');
  const offset = (clock: string) => {
    const [hours, minutes] = clock.split(':').map(Number);
    return (hours * 60 + minutes) * 60 * 1000;
  };
  return { from: new Date(midnight + offset(fromTime)), to: new Date(midnight + offset(toTime)), timezone: BUSINESS_TIMEZONE };
}

/** Use the same [from,to) predicate for every business timestamp. */
export function isWithinBusinessWindow(timestamp: Date, window: BusinessWindow): boolean {
  return timestamp.getTime() >= window.from.getTime() && timestamp.getTime() < window.to.getTime();
}

export function serializeBusinessWindow(window: BusinessWindow): { from: string; to: string; timezone: EndOfDayTimezone } {
  return { from: window.from.toISOString(), to: window.to.toISOString(), timezone: window.timezone };
}
