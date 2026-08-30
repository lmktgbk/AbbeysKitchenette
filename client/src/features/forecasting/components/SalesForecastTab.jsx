import { useState, useMemo } from "react";
import { useSalesForecast } from "../query";
import { DropDown } from "@/components/filters/DropDown";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const PERIOD_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

const METRIC_OPTIONS = [
  { value: "revenue", label: "Revenue" },
  { value: "orders", label: "Order Count" },
];

export default function SalesForecastTab() {
  const [period, setPeriod] = useState("14");
  const [metric, setMetric] = useState("revenue");

  const { data, isLoading, error } = useSalesForecast({ period });

  const forecastData = data?.data;
  const { historical = [], forecast = [], summary = {} } = forecastData ?? {};

  const trendBadge = summary.trend === "increasing"
    ? { variant: "success", label: `+${summary.trend_pct}%` }
    : summary.trend === "decreasing"
      ? { variant: "destructive", label: `${summary.trend_pct}%` }
      : { variant: "outline", label: "Stable" };

  const chartData = useMemo(() => {
    const hist = historical.map((d) => ({
      date: d.date,
      [metric]: d[metric],
      type: "actual",
    }));
    const fcast = forecast.map((d) => ({
      date: d.date,
      [metric]: Math.round(d.yhat),
      yhat_lower: Math.round(d.yhat_lower),
      yhat_upper: Math.round(d.yhat_upper),
      type: "forecast",
    }));
    return [...hist, ...fcast];
  }, [historical, forecast, metric]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) return null;
  if (!forecastData) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Avg Daily {metric === "revenue" ? "Revenue" : "Orders"}
          </p>
          <p className="text-lg font-bold text-foreground mt-1">
            {metric === "revenue"
              ? `₱${summary.avg_daily_revenue?.toLocaleString() ?? 0}`
              : summary.avg_daily_revenue?.toLocaleString() ?? "0"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Trend
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Icon
              name={summary.trend === "increasing" ? "trendingUp" : summary.trend === "decreasing" ? "trendingDown" : "minus"}
              size={16}
              className={summary.trend === "increasing" ? "text-green-600" : summary.trend === "decreasing" ? "text-red-600" : "text-muted-foreground"}
            />
            <Badge variant={trendBadge.variant}>{trendBadge.label}</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Peak Day
          </p>
          <p className="text-lg font-bold text-foreground mt-1">
            {summary.peak_day ?? "N/A"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Forecast ({period}d)
          </p>
          <p className="text-lg font-bold text-foreground mt-1">
            {forecast.length > 0 ? `${forecast.length} days` : "N/A"}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {metric === "revenue" ? "Revenue" : "Order Count"} Forecast
          </h3>
          <div className="flex items-center gap-2">
            <DropDown
              options={METRIC_OPTIONS}
              value={metric}
              onChange={setMetric}
              size="sm"
            />
            <DropDown
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
            />
          </div>
        </div>
        <div className="p-4">
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No data available for forecasting
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => metric === "revenue" ? `₱${v.toLocaleString()}` : v}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const label = name === "revenue" ? "Revenue" : name === "orders" ? "Orders" : name;
                    const formatted = metric === "revenue" ? `₱${value.toLocaleString()}` : value;
                    return [formatted, label];
                  }}
                  labelFormatter={(label) => new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey={metric}
                  name="Actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorActual)"
                  dot={false}
                  connectNulls={false}
                />
                {forecast.length > 0 && (
                  <Area
                    type="monotone"
                    dataKey={metric}
                    name="Forecast"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    fill="url(#colorForecast)"
                    dot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
