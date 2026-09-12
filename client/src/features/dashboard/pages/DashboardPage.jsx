import { useState, useCallback, useMemo } from "react";
import { useDashboardData } from "../query";
import DashboardHeader from "../components/DashboardHeader";
import DashboardKpis from "../components/DashboardKpis";
import RevenueChart from "../components/RevenueChart";
import HourlyOrdersChart from "../components/HourlyOrdersChart";
import DayOfWeekChart from "../components/DayOfWeekChart";
import TopProductsTable from "../components/TopProductsTable";
import CategorySalesChart from "../components/CategorySalesChart";
import OrdersOverview from "../components/OrdersOverview";
import FulfillmentTimeCard from "../components/FulfillmentTimeCard";
import CancellationChart from "../components/CancellationChart";
import IngredientOverview from "../components/IngredientOverview";
import IngredientCostChart from "../components/IngredientCostChart";
import MostRestockedTable from "../components/MostRestockedTable";
import TableUtilizationChart from "../components/TableUtilizationChart";
import StaffPerformanceChart from "../components/StaffPerformanceChart";

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

  const params = useMemo(() => {
    const p = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const { data, isLoading } = useDashboardData(params);

  const handleDateChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const d = data?.data;

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={handleDateChange}
      />

      <DashboardKpis kpis={d?.kpis} isLoading={isLoading} />

      {/* ─── Financial Overview ─── */}
      <SectionDivider title="Financial Overview" />

      <RevenueChart data={d?.revenueTrend} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HourlyOrdersChart data={d?.ordersByHour} isLoading={isLoading} />
        <DayOfWeekChart data={d?.ordersByDayOfWeek} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsTable title="Top 10 Most Sold" data={d?.topProducts} isLoading={isLoading} />
        <TopProductsTable title="Top 10 Least Sold" data={d?.leastProducts} isLoading={isLoading} />
      </div>

      <CategorySalesChart data={d?.salesByCategory} isLoading={isLoading} />

      {/* ─── Operations ─── */}
      <SectionDivider title="Operations" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <OrdersOverview
          statusData={d?.ordersByStatus}
          isLoading={isLoading}
          variant="status"
        />
        <FulfillmentTimeCard data={d?.fulfillmentTime} isLoading={isLoading} />
        <OrdersOverview
          sourceData={d?.ordersBySource}
          isLoading={isLoading}
          variant="source"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CancellationChart data={d?.cancellationReasons} isLoading={isLoading} />
        <StaffPerformanceChart data={d?.staffPerformance} isLoading={isLoading} />
      </div>

      <TableUtilizationChart data={d?.tableUtilization} isLoading={isLoading} />

      {/* ─── Inventory ─── */}
      <SectionDivider title="Inventory" />

      <IngredientOverview
        statusData={d?.ingredientStatus}
        lowStockData={d?.lowStockIngredients}
        isLoading={isLoading}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IngredientCostChart data={d?.ingredientCosts} isLoading={isLoading} />
        <MostRestockedTable data={d?.mostRestocked} isLoading={isLoading} />
      </div>
    </div>
  );
}
