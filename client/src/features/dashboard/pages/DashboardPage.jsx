import { useState, useCallback, useMemo } from "react";
import { useDashboardData, useRevenueTrend } from "../query";
import DashboardHeader from "../components/DashboardHeader";
import AnalyticsKpis from "@/features/analytics/components/AnalyticsKpis";
import { useAnalyticsKpis } from "@/features/analytics/query";
import { exportAnalyticsRequest } from "@/features/analytics/api";
import RevenueChart from "../components/RevenueChart";
import HourlyOrdersChart from "../components/HourlyOrdersChart";
import DayOfWeekChart from "../components/DayOfWeekChart";
import TopProductsTable from "../components/TopProductsTable";
import CategorySalesChart from "../components/CategorySalesChart";
import OrdersOverview from "../components/OrdersOverview";
import FulfillmentTimeCard from "../components/FulfillmentTimeCard";
import CancellationChart from "../components/CancellationChart";
import WasteSummaryCard from "../components/WasteSummaryCard";
import VariantProfitabilityTable from "@/features/analytics/components/VariantProfitabilityTable";
import IngredientProfitabilityTable from "@/features/analytics/components/IngredientProfitabilityTable";
import WasteDetailsModal from "@/features/analytics/components/WasteDetailsModal";
import ExportChoicesModal from "@/features/analytics/components/ExportChoicesModal";
import DashboardAnomalyBanner from "@/features/anomalyDetection/components/DashboardAnomalyBanner";

function SectionDivider({ title }) {
  return (
    <div className="flex items-center gap-3 pt-6 pb-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function DashboardPage() {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [granularity, setGranularity] = useState("daily");
  const [wasteOpen, setWasteOpen] = useState(false);

  const dateParams = useMemo(() => {
    const p = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const trendParams = useMemo(() => ({
    ...dateParams,
    granularity,
  }), [dateParams, granularity]);

  const { data, isLoading } = useDashboardData(dateParams);
  const { data: trendData, isLoading: trendLoading } = useRevenueTrend(trendParams);
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsKpis(dateParams);

  const handleDateChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const [exportOpen, setExportOpen] = useState(false);
  const handleExport = useCallback((types) => {
    const t = Array.isArray(types) ? types.join(",") : "all";
    exportAnalyticsRequest({ ...dateParams, type: t });
  }, [dateParams]);

  const d = data?.data;
  const ak = analyticsData?.data?.kpis;

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={handleDateChange}
        onExport={() => setExportOpen(true)}
      />
      <ExportChoicesModal open={exportOpen} onOpenChange={setExportOpen} onExport={handleExport} />

      <AnalyticsKpis kpis={ak} isLoading={analyticsLoading} />

      <DashboardAnomalyBanner />

      {/* ─── Sales & Profitability ─── */}
      <SectionDivider title="Sales & Profitability" />

      <RevenueChart
        data={trendData?.data}
        isLoading={trendLoading}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />

      <VariantProfitabilityTable dateFrom={dateFrom} dateTo={dateTo} />
      <IngredientProfitabilityTable dateFrom={dateFrom} dateTo={dateTo} />

      <CategorySalesChart data={d?.salesByCategory} isLoading={isLoading} />

      {/* ─── Operations ─── */}
      <SectionDivider title="Operations" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HourlyOrdersChart data={d?.ordersByHour} isLoading={isLoading} />
        <DayOfWeekChart data={d?.ordersByDayOfWeek} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <OrdersOverview
          statusData={d?.ordersByStatus}
          isLoading={isLoading}
          variant="status"
        />
        <FulfillmentTimeCard data={d?.fulfillmentTime} isLoading={isLoading} />
        <CancellationChart data={d?.cancellationReasons} isLoading={isLoading} />
      </div>

      {/* ─── Inventory & Waste ─── */}
      <SectionDivider title="Inventory & Waste" />

      <div onClick={() => setWasteOpen(true)} className="cursor-pointer">
        <WasteSummaryCard
          data={d?.wasteByType}
          totalLosses={ak?.totalLosses ?? d?.kpis?.totalLosses}
          isLoading={isLoading}
        />
      </div>
      <WasteDetailsModal open={wasteOpen} onOpenChange={setWasteOpen} dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}
