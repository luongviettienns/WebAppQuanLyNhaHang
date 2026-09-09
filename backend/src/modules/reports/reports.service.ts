import { prisma } from '../../config/prisma';

export class ReportsService {
  /**
   * Lay bao cao doanh thu, KPI va toc do phuc vu SOS theo ngay (Mui gio Asia/Ho_Chi_Minh)
   */
  static async getDailyReport(dateStr?: string) {
    let targetDate = dateStr;
    if (!targetDate) {
      // Lay ngay hien tai theo mui gio Viet Nam (Asia/Ho_Chi_Minh)
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      targetDate = formatter.format(now);
    }

    const startOfDay = new Date(`${targetDate}T00:00:00.000+07:00`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999+07:00`);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        items: {
          include: {
            menuItem: true
          }
        }
      }
    });

    const totalOrders = orders.length;
    const completedOrdersList = orders.filter((o) => o.status === 'COMPLETED');
    const cancelledOrdersList = orders.filter((o) => o.status === 'CANCELLED');

    const completedOrders = completedOrdersList.length;
    const cancelledOrders = cancelledOrdersList.length;

    // Doanh thu chi tinh tren don COMPLETED
    const totalRevenue = completedOrdersList.reduce((sum, o) => sum + o.finalAmount, 0);
    const averageOrderValue = completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0;

    // Tinh thoi gian chuan bi trung binh (Speed of Service - SOS) theo giay
    const prepTimes: number[] = [];
    for (const order of completedOrdersList) {
      if (order.readyAt && order.preparingAt) {
        const sec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) / 1000));
        prepTimes.push(sec);
      } else if (order.readyAt) {
        const sec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.createdAt).getTime()) / 1000));
        prepTimes.push(sec);
      }
    }

    const averagePrepTimeSec =
      prepTimes.length > 0 ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : 0;

    // Tinh Top 5 mon ban chay tu cac don COMPLETED
    const itemMap = new Map<number, { menuItemId: number; name: string; quantitySold: number; revenue: number }>();
    for (const order of completedOrdersList) {
      for (const item of order.items) {
        const existing = itemMap.get(item.menuItemId);
        if (existing) {
          existing.quantitySold += item.quantity;
          existing.revenue += item.subtotal;
        } else {
          itemMap.set(item.menuItemId, {
            menuItemId: item.menuItemId,
            name: item.menuItem?.name || `Món #${item.menuItemId}`,
            quantitySold: item.quantity,
            revenue: item.subtotal
          });
        }
      }
    }

    const topSellers = Array.from(itemMap.values())
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue)
      .slice(0, 5);

    return {
      report: {
        date: targetDate,
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        averageOrderValue,
        averagePrepTimeSec,
        topSellers
      }
    };
  }
}
