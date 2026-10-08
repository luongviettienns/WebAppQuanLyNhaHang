export interface OrderDatePreset {
  label: string;
  from: string;
  to: string;
}

export interface OrderDatePresets {
  today: OrderDatePreset;
  yesterday: OrderDatePreset;
  last7Days: OrderDatePreset;
  thisMonth: OrderDatePreset;
}

export function formatDateVn(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function getOrderDatePresets(referenceDate = new Date()): OrderDatePresets {
  // Chuẩn hóa ngày theo múi giờ Việt Nam
  const todayStr = formatDateVn(referenceDate);

  const [year, month, day] = todayStr.split('-').map(Number);

  // Hôm qua
  const yesterdayDate = new Date(Date.UTC(year, month - 1, day - 1));
  const yesterdayStr = formatDateVn(yesterdayDate);

  // 7 ngày qua (tính cả hôm nay = 7 ngày)
  const sevenDaysAgoDate = new Date(Date.UTC(year, month - 1, day - 6));
  const sevenDaysAgoStr = formatDateVn(sevenDaysAgoDate);

  // Đầu tháng này
  const startOfMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;

  return {
    today: {
      label: 'Hôm nay',
      from: todayStr,
      to: todayStr
    },
    yesterday: {
      label: 'Hôm qua',
      from: yesterdayStr,
      to: yesterdayStr
    },
    last7Days: {
      label: '7 ngày',
      from: sevenDaysAgoStr,
      to: todayStr
    },
    thisMonth: {
      label: 'Tháng này',
      from: startOfMonthStr,
      to: todayStr
    }
  };
}

export function isDatePresetActive(
  preset: { from: string; to: string },
  currentFrom?: string,
  currentTo?: string
): boolean {
  if (!currentFrom || !currentTo) return false;
  return currentFrom === preset.from && currentTo === preset.to;
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
