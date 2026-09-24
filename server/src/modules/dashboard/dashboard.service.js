import { dashboardRepository } from "./dashboard.repository.js";

/**
 * Dashboard Service
 *
 * Read-only landing payload for the admin dashboard. Fires ~26 independent
 * aggregations in one Promise.all — wall time equals the slowest query,
 * not the sum. Deltas compare the selected window against the previous
 * equal-length window; null baseline renders as "—", never ±100%.
 */
export const dashboardService = {
  /**
   * Full dashboard payload. The positional destructure MUST stay in the
   * same order as the Promise.all array — a rest-spread misindex here
   * once mislabeled every widget (see analytics getDashboard fix).
   */
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
    ]);

    // Loss severity is judged against true FIFO cost of goods, not revenue —
    // a peso lost on a low-margin item hurts more than on a premium one.
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
    };
  },
};
