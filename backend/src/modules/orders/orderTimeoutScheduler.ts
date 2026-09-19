import { OrdersService } from './orders.service';

let timeoutInterval: NodeJS.Timeout | null = null;

/**
 * Khoi dong bo quet ngam dinh ky tu dong huy don PENDING qua han.
 * @param intervalMs Chu ky quet (mac dinh: 60,000ms = 1 phut)
 * @param timeoutMinutes Thoi gian het han don hang (mac dinh: 60 phut)
 */
export function startOrderTimeoutScheduler(intervalMs: number = 60000, timeoutMinutes: number = 60): void {
  if (timeoutInterval) {
    return;
  }

  // Quet ngay 1 lan khi server khoi dong
  OrdersService.autoCancelExpiredOrders(timeoutMinutes).catch((err) => {
    console.error('[OrderTimeoutScheduler] Loi khi quet lan dau khoi dong:', err);
  });

  timeoutInterval = setInterval(async () => {
    try {
      const res = await OrdersService.autoCancelExpiredOrders(timeoutMinutes);
      if (res.cancelledCount > 0) {
        console.log(
          `⏱️ [OrderTimeoutScheduler] Da tu dong huy ${res.cancelledCount} don hang PENDING qua han (${timeoutMinutes} phut):`,
          res.cancelledOrderIds
        );
      }
    } catch (err) {
      console.error('[OrderTimeoutScheduler] Loi trong chu ky quet tu dong:', err);
    }
  }, intervalMs);

  // Khong chan Node process thoat khi shutdown
  if (timeoutInterval && typeof timeoutInterval.unref === 'function') {
    timeoutInterval.unref();
  }

  console.log(`⏱️ [OrderTimeoutScheduler] Da khoi dong bo quet tu dong huy don qua han (Chu ky: ${intervalMs / 1000}s, Timeout: ${timeoutMinutes} phut)`);
}

/**
 * Dung bo quet ngam khi shutdown hoac khi can thiet
 */
export function stopOrderTimeoutScheduler(): void {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
    console.log('⏱️ [OrderTimeoutScheduler] Da dung bo quet tu dong huy don qua han.');
  }
}
