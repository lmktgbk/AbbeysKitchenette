import { dashboardRepository } from "./dashboard.repository.js";

export const dashboardService = {
  async getData(dateFrom, dateTo) {
    const [
      todayKpis,
      periodKpis,
      previousPeriodKpis,
      revenueTrend,
      ordersByStatus,
      ordersBySource,
      topProducts,
      leastProducts,
      topVariants,
      salesByCategory,
      variantPerformance,
      ingredientStatus,
      lowStockIngredients,
      ingredientCosts,
      mostRestocked,
      ordersByHour,
      ordersByDayOfWeek,
      cancellationReasons,
      fulfillmentTime,
      tableUtilization,
      staffPerformance,
      cogs,
      cancellationRate,
      profit,
      totalLosses,
      wasteByType,
      stockValue,
      paymentMethodBreakdown,
      discountSummary,
      vatSummary,
    ] = await Promise.all([
      dashboardRepository.getTodayKpis(),
      dashboardRepository.getOrderKpis(dateFrom, dateTo),
      dashboardRepository.getPreviousPeriodKpis(dateFrom, dateTo),
      dashboardRepository.getRevenueTrend(dateFrom, dateTo),
      dashboardRepository.getOrdersByStatus(),
      dashboardRepository.getOrdersBySource(dateFrom, dateTo),
      dashboardRepository.getTopProducts(10, dateFrom, dateTo),
      dashboardRepository.getLeastProducts(10, dateFrom, dateTo),
      dashboardRepository.getTopVariants(10, dateFrom, dateTo),
      dashboardRepository.getSalesByCategory(dateFrom, dateTo),
      dashboardRepository.getVariantPerformance(null, dateFrom, dateTo),
      dashboardRepository.getIngredientStockStatus(),
      dashboardRepository.getLowStockIngredients(),
      dashboardRepository.getIngredientCosts(10),
      dashboardRepository.getMostRestocked(10),
      dashboardRepository.getOrdersByHour(dateFrom, dateTo),
      dashboardRepository.getOrdersByDayOfWeek(dateFrom, dateTo),
      dashboardRepository.getCancellationReasons(dateFrom, dateTo),
      dashboardRepository.getFulfillmentTime(dateFrom, dateTo),
      dashboardRepository.getTableUtilization(dateFrom, dateTo),
      dashboardRepository.getStaffPerformance(dateFrom, dateTo),
      dashboardRepository.getCOGS(dateFrom, dateTo),
      dashboardRepository.getCancellationRate(dateFrom, dateTo),
      dashboardRepository.getProfit(dateFrom, dateTo),
      dashboardRepository.getTotalLosses(dateFrom, dateTo),
      dashboardRepository.getWasteByType(dateFrom, dateTo),
      dashboardRepository.getStockValue(),
      dashboardRepository.getPaymentMethodBreakdown(dateFrom, dateTo),
      dashboardRepository.getDiscountSummary(dateFrom, dateTo),
      dashboardRepository.getVatSummary(dateFrom, dateTo),
    ]);

    const calcDelta = (current, previous) => {
      if (!previous || previous === 0) return null;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      kpis: {
        revenueToday: todayKpis.revenue,
        ordersToday: todayKpis.orders,
        aovToday: todayKpis.aov,
        revenuePeriod: periodKpis.revenue,
        ordersPeriod: periodKpis.orders,
        aovPeriod: periodKpis.aov,
        totalProducts: variantPerformance.length,
        lowStockCount: (ingredientStatus.low || 0) + (ingredientStatus.out || 0),
        cogs,
        profit: profit.profit,
        margin: profit.margin,
        cancellationRate: cancellationRate.rate,
        cancellationsCancelled: cancellationRate.cancelled,
        cancellationsTotal: cancellationRate.total,
        totalLosses: totalLosses.total_losses,
        orderLosses: totalLosses.order_losses,
        inventoryLosses: totalLosses.inventory_losses,
        lossRate: cogs > 0 ? Math.round((totalLosses.total_losses / cogs) * 1000) / 10 : 0,
        deltas: {
          revenue: calcDelta(periodKpis.revenue, previousPeriodKpis.revenue),
          orders: calcDelta(periodKpis.orders, previousPeriodKpis.orders),
          aov: calcDelta(Number(periodKpis.aov), Number(previousPeriodKpis.aov)),
        },
      },
      revenueTrend,
      ordersByStatus,
      ordersBySource,
      topProducts,
      leastProducts,
      topVariants,
      salesByCategory,
      variantPerformance,
      ingredientStatus,
      lowStockIngredients,
      ingredientCosts,
      mostRestocked,
      wasteByType,
      stockValue,
      ordersByHour,
      ordersByDayOfWeek,
      cancellationReasons,
      fulfillmentTime,
      tableUtilization,
      staffPerformance,
      paymentMethodBreakdown,
      discountSummary,
      vatSummary,
    };
  },

  /**
   * Today-only dashboard data — simplified for the main dashboard view.
   * @returns {object}
   */
  async getTodayData() {
    const today = new Date().toISOString().split("T")[0];

    const [
      todayKpis,
      cogs,
      discountSummary,
      refundSummary,
      paymentMethodBreakdown,
      ordersByHour,
      topProducts,
      salesByCategory,
      cancellationReasons,
      cancellationRate,
      inventoryVariance,
      cashReconciliation,
      ingredientStatus,
      lowStockIngredients,
    ] = await Promise.all([
      dashboardRepository.getTodayKpis(),
      dashboardRepository.getCOGS(today, today),
      dashboardRepository.getDiscountSummary(today, today),
      dashboardRepository.getRefundSummary(today, today),
      dashboardRepository.getPaymentMethodBreakdown(today, today),
      dashboardRepository.getOrdersByHour(today, today),
      dashboardRepository.getTopProducts(10, today, today),
      dashboardRepository.getSalesByCategory(today, today),
      dashboardRepository.getCancellationReasons(today, today),
      dashboardRepository.getCancellationRate(today, today),
      dashboardRepository.getInventoryVarianceSummary(),
      dashboardRepository.getCashReconciliationToday(),
      dashboardRepository.getIngredientStockStatus(),
      dashboardRepository.getLowStockIngredients(),
    ]);

    const grossRevenue = todayKpis.gross_revenue || 0;
    const netRevenue = todayKpis.revenue || 0;
    const totalDiscounts = discountSummary.totalDiscounts || 0;
    const totalRefunds = refundSummary.totalRefunds || 0;
    const grossProfit = netRevenue - cogs;
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;
    const transactions = todayKpis.completed_orders || 0;
    const avgTransactionValue = transactions > 0 ? Math.round((netRevenue / transactions) * 100) / 100 : 0;

    return {
      kpis: {
        grossRevenue,
        totalDiscounts,
        netRevenue,
        cogs,
        grossProfit,
        grossMargin,
        transactions,
        avgTransactionValue,
        discountCount: discountSummary.discountCount || 0,
        seniorDiscounts: discountSummary.senior || 0,
        pwdDiscounts: discountSummary.pwd || 0,
        promotionalDiscounts: discountSummary.promotional || 0,
        employeeDiscounts: discountSummary.employee || 0,
        cancellationRate: cancellationRate.rate,
      },
      discountSummary,
      refundSummary,
      paymentMethodBreakdown,
      ordersByHour,
      topProducts,
      salesByCategory,
      cancellationReasons,
      inventoryVariance,
      cashReconciliation,
      ingredientStatus,
      lowStockIngredients,
    };
  },
};
