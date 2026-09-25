import { analyticsService } from "./analytics.service.js";
import { successResponse, errorResponse, controllerError } from "../../utils/response.js";

/**
 * Analytics Controller (admin-only — enforced in routes)
 *
 * Thin HTTP layer. Report exports (Excel/PDF) import their renderers lazily
 * and degrade to 503 EXPORT_UNAVAILABLE when the optional dependency is
 * absent, so a missing export library never reads as a server crash.
 */

function handleError(res, error, fallbackCode) {
  return controllerError(res, error, fallbackCode);
}

export const analyticsController = {
  async getKpis(req, res) {
    try {
      const { date_from, date_to } = req.validatedQuery;
      const kpis = await analyticsService.getKpis(date_from, date_to);
      return successResponse(res, "Analytics KPIs retrieved", { kpis });
    } catch (error) {
      return handleError(res, error, "GET_ANALYTICS_KPIS_ERROR");
    }
  },

  async getTrend(req, res) {
    try {
      const { date_from, date_to, granularity } = req.validatedQuery;
      const trend = await analyticsService.getTrend(date_from, date_to, granularity);
      return successResponse(res, "Trend retrieved", trend);
    } catch (error) {
      return handleError(res, error, "GET_TREND_ERROR");
    }
  },

  async getVariantProfitability(req, res) {
    try {
      const { date_from, date_to, search, limit, page, category, sort, margin_band } = req.validatedQuery;
      // Cap 100 (not 50) so the 100-row page size is honored, not clamped.
      const lim = Math.min(Number(limit) || 10, 100);
      const pg = Math.max(Number(page) || 1, 1);
      const data = await analyticsService.getVariantProfitability({
        dateFrom: date_from,
        dateTo: date_to,
        search,
        limit: lim,
        offset: (pg - 1) * lim,
        category,
        sort,
        marginBand: margin_band,
      });
      return successResponse(res, "Variant profitability retrieved", { ...data, page: pg, limit: lim });
    } catch (error) {
      return handleError(res, error, "GET_VARIANT_PROFIT_ERROR");
    }
  },

  async getWasteDetails(req, res) {
    try {
      const { date_from, date_to, type, search, limit, page } = req.validatedQuery;
      const lim = Math.min(Number(limit) || 20, 100);
      const pg = Math.max(Number(page) || 1, 1);
      const data = await analyticsService.getWasteDetails({
        dateFrom: date_from,
        dateTo: date_to,
        type,
        search,
        limit: lim,
        offset: (pg - 1) * lim,
      });
      return successResponse(res, "Waste details retrieved", { ...data, page: pg, limit: lim });
    } catch (error) {
      return handleError(res, error, "GET_WASTE_DETAILS_ERROR");
    }
  },

  async getIngredientProfitability(req, res) {
    try {
      const { date_from, date_to, search, limit, page, sort, waste, unit } = req.validatedQuery;
      const lim = Math.min(Number(limit) || 20, 100);
      const pg = Math.max(Number(page) || 1, 1);
      const data = await analyticsService.getIngredientProfitability({
        dateFrom: date_from,
        dateTo: date_to,
        search,
        limit: lim,
        offset: (pg - 1) * lim,
        sort,
        waste,
        unit,
      });
      return successResponse(res, "Ingredient profitability retrieved", { ...data, page: pg, limit: lim });
    } catch (error) {
      return handleError(res, error, "GET_INGREDIENT_PROFIT_ERROR");
    }
  },

  async getIngredientUnits(req, res) {
    try {
      const units = await analyticsService.getIngredientUnits();
      return successResponse(res, "Ingredient units retrieved", { units });
    } catch (error) {
      return handleError(res, error, "GET_INGREDIENT_UNITS_ERROR");
    }
  },

  async getDashboard(req, res) {
    try {
      const { date_from, date_to } = req.validatedQuery;
      const data = await analyticsService.getDashboard(date_from, date_to);
      return successResponse(res, "Dashboard retrieved", data);
    } catch (error) {
      return handleError(res, error, "GET_DASHBOARD_ERROR");
    }
  },

  async exportExcel(req, res) {
    try {
      const { date_from, date_to, type, format } = req.validatedQuery;
      const types = type
        ? String(type).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
        : ["all"];
      const include = (k) => types.includes("all") || types.includes(k);
      const payload = await fetchExportData({ date_from, date_to, include, types });
      const outFormat = String(format || "excel").toLowerCase();
      const baseName = `Abbeys-KPIs-${date_from || "all"}-to-${date_to || "all"}`;

      if (outFormat === "pdf") {
        let buildPdfBuffer;
        try {
          ({ buildPdfBuffer } = await import("./exportPdf.js"));
        } catch {
          return errorResponse(res, "PDF export not available on server", null, 503, "EXPORT_UNAVAILABLE");
        }
        const buffer = await buildPdfBuffer(payload);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
        res.send(buffer);
        return;
      }

      let ExcelJS;
      try {
        ExcelJS = (await import("exceljs")).default;
      } catch {
        return errorResponse(res, "Excel export not available on server", null, 503, "EXPORT_UNAVAILABLE");
      }
      const workbook = buildExcelWorkbook(ExcelJS, payload);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return handleError(res, error, "EXPORT_EXCEL_ERROR");
    }
  },
};

/**
 * Shared export payload — one parallel fetch for both renderers so Excel
 * and PDF always report identical rows for the same filters.
 */
async function fetchExportData({ date_from, date_to, include, types }) {
  const [kpis, orders, variants, ingredients, trend, waste] = await Promise.all([
    analyticsService.getKpis(date_from, date_to),
    include("financial") || include("kpi") || include("orders")
      ? analyticsService.getOrdersLedger({ dateFrom: date_from, dateTo: date_to })
      : null,
    include("variants")
      ? analyticsService.getVariantProfitability({ dateFrom: date_from, dateTo: date_to, limit: 50, offset: 0 })
      : null,
    include("ingredients")
      ? analyticsService.getIngredientProfitability({ dateFrom: date_from, dateTo: date_to, limit: 50, offset: 0 })
      : null,
    include("trend") ? analyticsService.getTrend(date_from, date_to, "daily") : null,
    include("waste")
      ? analyticsService.getWasteDetails({ dateFrom: date_from, dateTo: date_to, limit: 200, offset: 0 })
      : null,
  ]);
  return {
    meta: {
      dateFrom: date_from || null,
      dateTo: date_to || null,
      types: types.join(", "),
      generated: new Date().toISOString(),
    },
    kpis,
    orders,
    variants,
    ingredients,
    trend,
    waste,
  };
}

/**
 * Excel workbook writer — same sheets as the original inline implementation,
 * plus a KPI Summary first sheet (mirrors the PDF cards), all fed by the
 * shared payload.
 */
function buildExcelWorkbook(ExcelJS, payload) {
  const { kpis, orders: ledger, variants: v, ingredients: ig, trend: tr, waste: wd, meta } = payload;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Abbey's Kitchenette";
  workbook.created = new Date();

  if (kpis) {
    const ks = workbook.addWorksheet("Summary");
    ks.columns = [
      { header: "Metric", key: "metric", width: 20 },
      { header: "Value", key: "value", width: 18 },
      { header: "Change vs Prior", key: "delta", width: 18 },
    ];
    ks.getRow(1).font = { bold: true };
    const deltaFmt = (d) => (d == null ? "-" : `${d > 0 ? "+" : ""}${d}%`);
    const kpiRows = [
      ["Gross Sales", kpis.grossSales, deltaFmt(kpis.deltas?.grossSales)],
      ["Discounts", kpis.discounts, "-"],
      ["Net Sales", kpis.netSales, deltaFmt(kpis.deltas?.netSales)],
      ["Transactions", kpis.transactions, deltaFmt(kpis.deltas?.transactions)],
      ["Avg Ticket", kpis.atv, deltaFmt(kpis.deltas?.atv)],
      ["COGS", kpis.cogs, deltaFmt(kpis.deltas?.cogs)],
      ["Gross Profit", kpis.grossProfit, deltaFmt(kpis.deltas?.grossProfit)],
      ["Net Profit", kpis.netProfit, deltaFmt(kpis.deltas?.netProfit)],
    ];
    for (const [metric, value, d] of kpiRows) ks.addRow({ metric, value, delta: d });
  }

  if (ledger) {
    const ordersSheet = workbook.addWorksheet("Orders");
    ordersSheet.columns = [
          { header: "Order #", key: "order_number", width: 16 },
          { header: "Date", key: "order_date", width: 12 },
          { header: "Customer", key: "customer_name", width: 18 },
          { header: "Table", key: "table_number", width: 10 },
          { header: "Source", key: "order_source", width: 10 },
          { header: "Status", key: "status", width: 12 },
          { header: "Units", key: "units", width: 8 },
          { header: "Gross", key: "gross", width: 12 },
          { header: "Discount", key: "discounts", width: 12 },
          { header: "Net", key: "net", width: 12 },
          { header: "COGS", key: "cogs", width: 12 },
          { header: "Profit", key: "profit", width: 12 },
          { header: "Margin %", key: "margin", width: 10 },
          { header: "Payment", key: "payment_method", width: 10 },
          { header: "Cashier", key: "cashier", width: 16 },
        ];
        ordersSheet.getRow(1).font = { bold: true };
        for (const r of ledger.rows) {
          ordersSheet.addRow({
            order_number: `#${String(r.order_number).padStart(4, "0")}`,
            order_date: r.order_date,
            customer_name: r.customer_name,
            table_number: r.table_number,
            order_source: r.order_source,
            status: r.status,
            units: r.units,
            gross: r.gross,
            discounts: r.discounts,
            net: r.net,
            cogs: r.cogs,
            profit: r.profit,
            margin: r.margin,
            payment_method: r.payment_method,
            cashier: r.cashier,
          });
        }
        // Totals row
        const totalRow = ordersSheet.addRow({
          order_number: "TOTAL",
          gross: ledger.totals.gross,
          discounts: ledger.totals.discounts || 0,
          net: ledger.totals.net,
          cogs: ledger.totals.cogs,
          profit: ledger.totals.profit,
          margin: ledger.totals.net > 0 ? Math.round((ledger.totals.profit / ledger.totals.net) * 1000) / 10 : 0,
        });
        totalRow.font = { bold: true };
        totalRow.commit();
      }

      if (v) {
        const vs = workbook.addWorksheet("Variants Profitability");
        vs.columns = [
          { header: "Product", key: "product", width: 22 },
          { header: "Variant", key: "variant", width: 14 },
          { header: "Units", key: "units", width: 10 },
          { header: "Net Sales", key: "net", width: 14 },
          { header: "COGS", key: "cogs", width: 14 },
          { header: "Profit", key: "profit", width: 14 },
          { header: "Margin %", key: "margin", width: 10 },
        ];
        vs.getRow(1).font = { bold: true };
        for (const r of v.rows) vs.addRow({ product: r.product_name, variant: r.size_name, units: r.units, net: r.net_sales, cogs: r.cogs, profit: r.profit, margin: r.margin });
      }

      if (ig) {
        const is = workbook.addWorksheet("Ingredients");
        is.columns = [
          { header: "Ingredient", key: "name", width: 22 },
          { header: "Stock Value", key: "stock", width: 14 },
          { header: "Restocks", key: "count", width: 10 },
          { header: "Total Spend", key: "spend", width: 14 },
          { header: "Waste", key: "waste", width: 14 },
        ];
        is.getRow(1).font = { bold: true };
        for (const r of ig.rows) is.addRow({ name: r.ingredient_name, stock: r.stock_value, count: r.restock_count, spend: r.total_spend, waste: r.total_waste });
      }

      if (tr) {
        const ts = workbook.addWorksheet("Trend");
        ts.columns = [
          { header: "Date", key: "date", width: 14 },
          { header: "Gross", key: "gross", width: 14 },
          { header: "Net", key: "net", width: 14 },
          { header: "COGS", key: "cogs", width: 14 },
          { header: "Profit", key: "profit", width: 14 },
          { header: "Orders", key: "orders", width: 10 },
        ];
        ts.getRow(1).font = { bold: true };
        for (const d of tr || []) ts.addRow({ date: d.date, gross: d.gross, net: d.revenue, cogs: d.cogs, profit: d.profit, orders: d.orders });
      }

      if (wd) {
        const ws = workbook.addWorksheet("Waste");
        ws.columns = [
          { header: "Date", key: "date", width: 14 },
          { header: "Ingredient", key: "ingredient", width: 22 },
          { header: "Type", key: "type", width: 12 },
          { header: "Qty Lost", key: "qty", width: 12 },
          { header: "Cost Lost", key: "cost", width: 14 },
          { header: "Notes", key: "notes", width: 30 },
        ];
        ws.getRow(1).font = { bold: true };
        for (const r of wd.rows || []) ws.addRow({ date: r.logged_at, ingredient: r.ingredient_name, type: r.type, qty: r.quantity_lost, cost: r.total_cost_lost, notes: r.notes });
      }

      // Period info
      const info = workbook.addWorksheet("Info");
      info.columns = [
        { header: "Field", key: "field", width: 18 },
        { header: "Value", key: "value", width: 22 },
      ];
      info.getRow(1).font = { bold: true };
      info.addRow({ field: "Date From", value: meta.dateFrom || "All time" });
      info.addRow({ field: "Date To", value: meta.dateTo || "All time" });
      info.addRow({ field: "Types", value: meta.types });
      info.addRow({ field: "Generated", value: meta.generated });

      return workbook;
}
