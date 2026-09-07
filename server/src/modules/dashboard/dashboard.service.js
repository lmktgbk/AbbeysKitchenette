import { dashboardRepository } from "./dashboard.repository.js";

/**
 * Dashboard Service
 *
 * Orchestrates all repository queries to build the consolidated dashboard response.
 */
export const dashboardService = {
  /**
   * Get all dashboard data for a given date range.
   * @param {string|null} dateFrom - YYYY-MM-DD or null
   * @param {string|null} dateTo - YYYY-MM-DD or null
   * @returns {object} - consolidated dashboard data
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
      topVariants,
      salesByCategory,
      variantPerformance,
      ingredientStatus,
      lowStockIngredients,
      ingredientCosts,
      stockVsForecast,
      ordersByHour,
      ordersByDayOfWeek,
      cancellationReasons,
      fulfillmentTime,
      tableUtilization,
      staffPerformance,
      topCombos,
    ] = await Promise.all([
      dashboardRepository.getTodayKpis(),
      dashboardRepository.getOrderKpis(dateFrom, dateTo),
      dashboardRepository.getPreviousPeriodKpis(dateFrom, dateTo),
      dashboardRepository.getDailyRevenueTrend(dateFrom, dateTo),
      dashboardRepository.getOrdersByStatus(),
      dashboardRepository.getOrdersBySource(dateFrom, dateTo),
      dashboardRepository.getTopProducts(10, dateFrom, dateTo),
      dashboardRepository.getTopVariants(10, dateFrom, dateTo),
      dashboardRepository.getSalesByCategory(dateFrom, dateTo),
      dashboardRepository.getVariantPerformance(null, dateFrom, dateTo),
      dashboardRepository.getIngredientStockStatus(),
      dashboardRepository.getLowStockIngredients(),
      dashboardRepository.getIngredientCosts(10),
      dashboardRepository.getStockVsForecast(),
      dashboardRepository.getOrdersByHour(dateFrom, dateTo),
      dashboardRepository.getOrdersByDayOfWeek(dateFrom, dateTo),
      dashboardRepository.getCancellationReasons(dateFrom, dateTo),
      dashboardRepository.getFulfillmentTime(dateFrom, dateTo),
      dashboardRepository.getTableUtilization(dateFrom, dateTo),
      dashboardRepository.getStaffPerformance(dateFrom, dateTo),
      dashboardRepository.getTopCombos(5),
    ]);

    const calcDelta = (current, previous) => {
      if (!previous || previous === 0) return null;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    const totalCost = variantPerformance.reduce((sum, v) => sum + (v.cost || 0), 0);
    const totalRevenue = variantPerformance.reduce((sum, v) => sum + (v.revenue || 0), 0);
    const overallMargin = totalRevenue > 0
      ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10
      : 0;

    const prevTotalCost = 0;
    const prevMargin = 0;

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
        margin: overallMargin,
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
      topVariants,
      salesByCategory,
      variantPerformance,
      ingredientStatus,
      lowStockIngredients,
      ingredientCosts,
      stockVsForecast,
      ordersByHour,
      ordersByDayOfWeek,
      cancellationReasons,
      fulfillmentTime,
      tableUtilization,
      staffPerformance,
      topCombos,
    };
  },
};
