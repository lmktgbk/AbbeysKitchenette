import { useState, useCallback, useMemo } from "react";
import { useDashboardData } from "../query";
import DashboardHeader from "../components/DashboardHeader";
import DashboardKpis from "../components/DashboardKpis";
import OverviewSection from "../components/OverviewSection";
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
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "operations", label: "Operations" },
  { id: "inventory", label: "Inventory" },
];

export default function DashboardPage() {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");

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
  const show = (section) => activeSection === section;

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={handleDateChange}
      />

      <div className="flex gap-2 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              activeSection === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DashboardKpis kpis={d?.kpis} isLoading={isLoading} />

      {show("overview") && (
        <OverviewSection data={d} isLoading={isLoading} />
      )}

      {show("sales") && (
        <div>
          <RevenueChart data={d?.revenueTrend} isLoading={isLoading} />
          <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
            <HourlyOrdersChart data={d?.ordersByHour} isLoading={isLoading} />
            <DayOfWeekChart data={d?.ordersByDayOfWeek} isLoading={isLoading} />
          </div>
          <div className="mt-4">
            <TopProductsChart data={d?.topProducts} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
            <CategorySalesChart data={d?.salesByCategory} isLoading={isLoading} />
            <TopCombosCard data={d?.topCombos} isLoading={isLoading} />
          </div>
        </div>
      )}

      {show("operations") && (
        <div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <OrdersOverview
              statusData={d?.ordersByStatus}
              sourceData={d?.ordersBySource}
              isLoading={isLoading}
            />
            <FulfillmentTimeCard data={d?.fulfillmentTime} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
            <CancellationChart data={d?.cancellationReasons} isLoading={isLoading} />
            <StaffPerformanceChart data={d?.staffPerformance} isLoading={isLoading} />
          </div>
          <div className="mt-4">
            <TableUtilizationChart data={d?.tableUtilization} isLoading={isLoading} />
          </div>
        </div>
      )}

      {show("inventory") && (
        <div>
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
      )}
    </div>
  );
}
