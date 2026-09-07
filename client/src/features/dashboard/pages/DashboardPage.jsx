import { useState, useCallback, useMemo } from "react";
import { useDashboardData } from "../query";
import DashboardHeader from "../components/DashboardHeader";
import DashboardKpis from "../components/DashboardKpis";
import RevenueChart from "../components/RevenueChart";
import HourlyOrdersChart from "../components/HourlyOrdersChart";
import DayOfWeekChart from "../components/DayOfWeekChart";
import TopProductsChart from "../components/TopProductsChart";
import CategorySalesChart from "../components/CategorySalesChart";
import TopCombosCard from "../components/TopCombosCard";
import OrdersOverview from "../components/OrdersOverview";
import FulfillmentTimeCard from "../components/FulfillmentTimeCard";
import CancellationChart from "../components/CancellationChart";
import IngredientOverview from "../components/IngredientOverview";
import IngredientCostChart from "../components/IngredientCostChart";
import StockVsForecastChart from "../components/StockVsForecastChart";
import TableUtilizationChart from "../components/TableUtilizationChart";
import StaffPerformanceChart from "../components/StaffPerformanceChart";

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full bg-primary" />
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
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

  const { data, isLoading, refetch } = useDashboardData(params);

  const handleDateChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const d = data?.data;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <DashboardHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={handleDateChange}
      />

      {/* Section 1: Executive Summary */}
      <DashboardKpis kpis={d?.kpis} isLoading={isLoading} />

      {/* Section 2: Revenue & Demand */}
      <div>
        <SectionHeader title="Revenue & Demand" subtitle="When customers come and how revenue flows" />
        <RevenueChart data={d?.revenueTrend} isLoading={isLoading} />
        <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
          <HourlyOrdersChart data={d?.ordersByHour} isLoading={isLoading} />
          <DayOfWeekChart data={d?.ordersByDayOfWeek} isLoading={isLoading} />
        </div>
      </div>

      {/* Section 3: Sales Performance */}
      <div>
        <SectionHeader title="Sales Performance" subtitle="What sells and what pairs well" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopProductsChart data={d?.topProducts} isLoading={isLoading} />
          <CategorySalesChart data={d?.salesByCategory} isLoading={isLoading} />
        </div>
        <div className="mt-4">
          <TopCombosCard data={d?.topCombos} isLoading={isLoading} />
        </div>
      </div>

      {/* Section 4: Operations */}
      <div>
        <SectionHeader title="Operations" subtitle="Order flow, speed, and cancellations" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <OrdersOverview
            statusData={d?.ordersByStatus}
            sourceData={d?.ordersBySource}
            isLoading={isLoading}
          />
          <FulfillmentTimeCard data={d?.fulfillmentTime} isLoading={isLoading} />
        </div>
        <div className="mt-4">
          <CancellationChart data={d?.cancellationReasons} isLoading={isLoading} />
        </div>
      </div>

      {/* Section 5: Inventory */}
      <div>
        <SectionHeader title="Inventory" subtitle="Stock levels, costs, and forecasting" />
        <IngredientOverview
          statusData={d?.ingredientStatus}
          lowStockData={d?.lowStockIngredients}
          isLoading={isLoading}
        />
        <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
          <IngredientCostChart data={d?.ingredientCosts} isLoading={isLoading} />
          <StockVsForecastChart data={d?.stockVsForecast} isLoading={isLoading} />
        </div>
      </div>

      {/* Section 6: Table & Staff */}
      <div>
        <SectionHeader title="Table & Staff" subtitle="Who performs and which tables drive revenue" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TableUtilizationChart data={d?.tableUtilization} isLoading={isLoading} />
          <StaffPerformanceChart data={d?.staffPerformance} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
