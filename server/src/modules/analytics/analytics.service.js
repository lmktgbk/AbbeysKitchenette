import { analyticsRepository } from "./analytics.repository.js";
import { dashboardRepository } from "../dashboard/dashboard.repository.js";

/**
 * Analytics Service
 *
 * Read-only reporting over orders/inventory. All heavy lifting lives in the
 * repositories (SQL aggregations); this layer only joins period-vs-period
 * results and shapes the dashboard payload. No writes, no transactions.
 */

/**
 * Period-over-period change in percent (1 decimal). Null when there is no
 * baseline — the UI renders "—" instead of a misleading ±100%.
 */
function calcDelta(current, previous) {
  if (previous == null || previous === 0) return null;
  if (current == null) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export const analyticsService = {
  /**
   * Financial KPIs for a window plus deltas against the previous equal-length
   * window (computed from the same repository shape so figures always agree).
   */
  async getKpis(dateFrom, dateTo) {
    const [kpis, previous] = await Promise.all([
      analyticsRepository.getFinancialKpis(dateFrom, dateTo),
      analyticsRepository.getPreviousPeriodKpis(dateFrom, dateTo),
    ]);

    const deltas = previous
      ? {
          grossSales: calcDelta(kpis.grossSales, previous.grossSales),
          netSales: calcDelta(kpis.netSales, previous.netSales),
          transactions: calcDelta(kpis.transactions, previous.transactions),
          atv: calcDelta(kpis.atv, previous.atv),
          cogs: calcDelta(kpis.cogs, previous.cogs),
          grossProfit: calcDelta(kpis.grossProfit, previous.grossProfit),
          netProfit: calcDelta(kpis.netProfit, previous.netProfit),
        }
      : null;

    return { ...kpis, deltas, previous };
  },

  async getTrend(dateFrom, dateTo, granularity = "daily") {
    return dashboardRepository.getRevenueTrend(dateFrom, dateTo, granularity);
  },

  async getVariantProfitability(params) {
    return analyticsRepository.getVariantProfitability(params);
  },

  async getWasteDetails(params) {
    return analyticsRepository.getWasteDetails(params);
  },

  async getIngredientProfitability(params) {
    return analyticsRepository.getIngredientProfitability(params);
  },

  async getOrdersLedger(params) {
    return analyticsRepository.getOrdersLedger(params);
  },

  async getDashboard(dateFrom, dateTo) {
    const [kpis, trend, ...rest] = await Promise.all([
      this.getKpis(dateFrom, dateTo),
      dashboardRepository.getRevenueTrend(dateFrom, dateTo, "daily"),
      dashboardRepository.getOrdersByStatus(),
      dashboardRepository.getTopProducts(10, dateFrom, dateTo),
      dashboardRepository.getLeastProducts(10, dateFrom, dateTo),
      dashboardRepository.getSalesByCategory(dateFrom, dateTo),
      dashboardRepository.getOrdersByHour(dateFrom, dateTo),
      dashboardRepository.getOrdersByDayOfWeek(dateFrom, dateTo),
      dashboardRepository.getCancellationReasons(dateFrom, dateTo),
      dashboardRepository.getFulfillmentTime(dateFrom, dateTo),
      dashboardRepository.getIngredientStockStatus(),
      dashboardRepository.getWasteByType(dateFrom, dateTo),
      dashboardRepository.getStockValue(),
    ]);
    // rest[] follows the Promise.all order above starting at getOrdersByStatus.
    return {
      kpis,
      trend,
      ordersByStatus: rest[0],
      topProducts: rest[1],
      leastProducts: rest[2],
      salesByCategory: rest[3],
      ordersByHour: rest[4],
      ordersByDayOfWeek: rest[5],
      cancellationReasons: rest[6],
      fulfillmentTime: rest[7],
      ingredientStatus: rest[8],
      wasteByType: rest[9],
      stockValue: rest[10],
    };
  },
};
