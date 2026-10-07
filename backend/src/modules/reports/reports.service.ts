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

    // Tinh phan bo doanh thu theo phuong thuc thanh toan tu cac don COMPLETED
    let cashTotal = 0;
    let cashCount = 0;
    let bankTransferTotal = 0;
    let bankTransferCount = 0;
    let otherTotal = 0;
    let otherCount = 0;

    for (const order of completedOrdersList) {
      if (order.paymentMethod === 'CASH') {
        cashCount += 1;
        cashTotal += order.finalAmount;
      } else if (order.paymentMethod === 'BANK_TRANSFER') {
        bankTransferCount += 1;
        bankTransferTotal += order.finalAmount;
      } else {
        otherCount += 1;
        otherTotal += order.finalAmount;
      }
    }

    const paymentBreakdown = {
      cash: { count: cashCount, total: cashTotal },
      bankTransfer: { count: bankTransferCount, total: bankTransferTotal },
      other: { count: otherCount, total: otherTotal }
    };

    // Tinh tong chi phi gia von (COGS) tu cac giao dich AUTO_DEDUCT va KITCHEN_WASTE trong ngay
    const inventoryTx = await prisma.inventoryTransaction.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        },
        type: {
          in: ['AUTO_DEDUCT', 'KITCHEN_WASTE']
        }
      }
    });

    let salesCogs = 0;
    let kitchenWasteCost = 0;

    for (const tx of inventoryTx) {
      if (tx.type === 'KITCHEN_WASTE') {
        kitchenWasteCost += Math.abs(tx.costAmount);
      } else {
        salesCogs += Math.abs(tx.costAmount);
      }
    }

    const totalCogs = salesCogs + kitchenWasteCost;
    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

    const profitSummary = {
      totalRevenue,
      salesCogs,
      kitchenWasteCost,
      totalCogs,
      grossProfit,
      grossMargin
    };

    return {
      report: {
        date: targetDate,
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        averageOrderValue,
        averagePrepTimeSec,
        topSellers,
        paymentBreakdown,
        profitSummary
      }
    };
  }

  /**
   * Báo cáo Tài chính & Lãi Lỗ (Profit and Loss Statement - P&L)
   */
  static async getProfitAndLoss(query?: { date?: string; from?: string; to?: string }) {
    let targetDate = query?.date;
    if (!targetDate && !query?.from) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      targetDate = formatter.format(now);
    }

    let startRange: Date;
    let endRange: Date;

    if (query?.from && query?.to) {
      startRange = new Date(query.from);
      endRange = new Date(query.to);
    } else if (targetDate) {
      startRange = new Date(`${targetDate}T00:00:00.000+07:00`);
      endRange = new Date(`${targetDate}T23:59:59.999+07:00`);
    } else {
      const now = new Date();
      startRange = new Date(now.setHours(0, 0, 0, 0));
      endRange = new Date(now.setHours(23, 59, 59, 999));
    }

    // 1. Lấy đơn hàng hoàn thành trong kỳ
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startRange, lte: endRange },
        status: 'COMPLETED'
      }
    });

    const grossSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const discountAmount = orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
    const vatAmount = orders.reduce((sum, o) => sum + (o.vatAmount || 0), 0);
    const orderFinalTotal = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const orderCount = orders.length;

    // 2. Lấy đơn hoàn hàng (Sales Returns) trong kỳ
    const salesReturns = await prisma.orderReturn.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: startRange, lte: endRange }
      }
    });
    const returnsAmount = salesReturns.reduce((sum, r) => sum + (r.refundedAmount || 0), 0);

    const netRevenue = Math.max(0, orderFinalTotal - returnsAmount);

    // 3. Giá vốn hàng bán (COGS) & Hao hụt bếp từ InventoryTransaction
    const inventoryTx = await prisma.inventoryTransaction.findMany({
      where: {
        createdAt: { gte: startRange, lte: endRange },
        type: { in: ['AUTO_DEDUCT', 'SALES_RETURN', 'KITCHEN_WASTE'] }
      }
    });

    let autoDeductCost = 0;
    let salesReturnCost = 0;
    let kitchenWasteCost = 0;

    for (const tx of inventoryTx) {
      if (tx.type === 'AUTO_DEDUCT') {
        autoDeductCost += Math.abs(tx.costAmount);
      } else if (tx.type === 'SALES_RETURN') {
        salesReturnCost += Math.abs(tx.costAmount);
      } else if (tx.type === 'KITCHEN_WASTE') {
        kitchenWasteCost += Math.abs(tx.costAmount);
      }
    }

    const salesCogs = Math.max(0, autoDeductCost - salesReturnCost);
    const grossProfit = netRevenue - salesCogs;
    const grossProfitMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;

    // 4. Chi phí hoạt động từ sổ quỹ (CashVoucher PAYMENT status POSTED affectsBusinessResult = true)
    const expenseVouchers = await prisma.cashVoucher.findMany({
      where: {
        occurredAt: { gte: startRange, lte: endRange },
        direction: 'PAYMENT',
        status: 'POSTED',
        affectsBusinessResult: true
      },
      include: {
        category: true
      }
    });

    let cashExpenses = 0;
    let payrollCost = 0;
    const categoryMap = new Map<string, number>();

    for (const v of expenseVouchers) {
      cashExpenses += v.amount;
      if (v.sourceType === 'PAYROLL_PAYMENT') {
        payrollCost += v.amount;
      }
      const catName = v.category?.name || 'Chi phí khác';
      categoryMap.set(catName, (categoryMap.get(catName) || 0) + v.amount);
    }

    const expenseBreakdownByCategory = Array.from(categoryMap.entries()).map(([categoryName, amount]) => ({
      categoryName,
      amount
    }));

    const totalExpenses = kitchenWasteCost + cashExpenses;
    const operatingProfit = grossProfit - totalExpenses;
    const netProfitMargin = netRevenue > 0 ? Math.round((operatingProfit / netRevenue) * 1000) / 10 : 0;

    // 5. Phân bổ theo phương thức thanh toán
    let cash = 0;
    let bankTransfer = 0;
    let other = 0;

    for (const o of orders) {
      if (o.paymentMethod === 'CASH') cash += o.finalAmount;
      else if (o.paymentMethod === 'BANK_TRANSFER') bankTransfer += o.finalAmount;
      else other += o.finalAmount;
    }

    return {
      timeframe: {
        from: startRange.toISOString(),
        to: endRange.toISOString(),
        date: targetDate
      },
      revenue: {
        grossSales,
        discountAmount,
        returnsAmount,
        netRevenue,
        vatAmount,
        orderCount
      },
      cogs: {
        salesCogs,
        grossProfit,
        grossProfitMargin
      },
      operatingExpenses: {
        kitchenWasteCost,
        cashExpenses,
        payrollCost,
        totalExpenses
      },
      netProfit: {
        operatingProfit,
        netProfitMargin
      },
      revenueByPaymentMethod: {
        cash,
        bankTransfer,
        other
      },
      expenseBreakdownByCategory
    };
  }

  /**
   * Báo cáo Xuất - Nhập - Tồn Kho Nguyên Liệu (Inventory In-Out-Stock Balance)
   */
  static async getInventoryBalance(query?: { date?: string; from?: string; to?: string; search?: string }) {
    let targetDate = query?.date;
    if (!targetDate && !query?.from) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      targetDate = formatter.format(now);
    }

    let startRange: Date;
    let endRange: Date;

    if (query?.from && query?.to) {
      startRange = new Date(query.from);
      endRange = new Date(query.to);
    } else if (targetDate) {
      startRange = new Date(`${targetDate}T00:00:00.000+07:00`);
      endRange = new Date(`${targetDate}T23:59:59.999+07:00`);
    } else {
      const now = new Date();
      startRange = new Date(now.setHours(0, 0, 0, 0));
      endRange = new Date(now.setHours(23, 59, 59, 999));
    }

    const ingredients = await prisma.ingredient.findMany({
      where: {
        isActive: true,
        ...(query?.search ? {
          OR: [
            { sku: { contains: query.search } },
            { name: { contains: query.search } }
          ]
        } : {})
      },
      orderBy: { name: 'asc' }
    });

    const ingredientIds = ingredients.map((i) => i.id);
    const allTransactions = await prisma.inventoryTransaction.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        createdAt: { lte: endRange }
      },
      orderBy: { createdAt: 'asc' }
    });

    const txByIngredient = new Map<number, typeof allTransactions>();
    for (const tx of allTransactions) {
      const list = txByIngredient.get(tx.ingredientId) || [];
      list.push(tx);
      txByIngredient.set(tx.ingredientId, list);
    }

    const items = [];
    let totalInventoryValue = 0;
    let lowStockCount = 0;
    let totalStockInQuantity = 0;
    let totalStockOutQuantity = 0;
    let totalWasteQuantity = 0;
    let totalWasteValue = 0;

    for (const ing of ingredients) {
      const txList = txByIngredient.get(ing.id) || [];
      let openingStock = 0;
      let stockIn = 0;
      let stockOut = 0;
      let waste = 0;
      let manualAdjust = 0;

      for (const tx of txList) {
        if (tx.createdAt < startRange) {
          openingStock += tx.quantity;
        } else {
          if (tx.type === 'STOCK_IN' || tx.type === 'VOID_RESTORE') {
            stockIn += Math.abs(tx.quantity);
          } else if (tx.type === 'AUTO_DEDUCT') {
            stockOut += Math.abs(tx.quantity);
          } else if (tx.type === 'SALES_RETURN') {
            stockOut -= Math.abs(tx.quantity);
          } else if (tx.type === 'KITCHEN_WASTE') {
            waste += Math.abs(tx.quantity);
          } else if (tx.type === 'MANUAL_ADJUST') {
            manualAdjust += tx.quantity;
          } else if (tx.type === 'PURCHASE_RETURN') {
            stockIn -= Math.abs(tx.quantity);
          }
        }
      }

      const closingStock = Math.round((openingStock + stockIn - stockOut - waste + manualAdjust) * 1000) / 1000;
      const inventoryValue = Math.max(0, Math.round(closingStock * ing.costPerUnit));
      const isLowStock = closingStock <= ing.minThreshold;

      if (isLowStock) lowStockCount += 1;
      totalInventoryValue += inventoryValue;
      totalStockInQuantity += stockIn;
      totalStockOutQuantity += stockOut;
      totalWasteQuantity += waste;
      totalWasteValue += Math.round(waste * ing.costPerUnit);

      items.push({
        ingredientId: ing.id,
        sku: ing.sku,
        name: ing.name,
        unit: ing.unit,
        costPerUnit: ing.costPerUnit,
        minThreshold: ing.minThreshold,
        openingStock: Math.round(openingStock * 1000) / 1000,
        stockIn: Math.round(stockIn * 1000) / 1000,
        stockOut: Math.round(stockOut * 1000) / 1000,
        waste: Math.round(waste * 1000) / 1000,
        manualAdjust: Math.round(manualAdjust * 1000) / 1000,
        closingStock,
        inventoryValue,
        isLowStock
      });
    }

    return {
      timeframe: {
        from: startRange.toISOString(),
        to: endRange.toISOString(),
        date: targetDate
      },
      summary: {
        totalIngredients: ingredients.length,
        totalInventoryValue,
        lowStockCount,
        totalStockInQuantity: Math.round(totalStockInQuantity * 1000) / 1000,
        totalStockOutQuantity: Math.round(totalStockOutQuantity * 1000) / 1000,
        totalWasteQuantity: Math.round(totalWasteQuantity * 1000) / 1000,
        totalWasteValue
      },
      items
    };
  }
}
