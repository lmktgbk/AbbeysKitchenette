import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

/**
 * ForecastChart — daily units/revenue area chart with confidence band + history overlay.
 */
export default function ForecastChart({ results, previousResults, viewPeriod = 14 }) {
  const [metric, setMetric] = useState("units");

  const chartData = useMemo(() => {
    if (!results?.length) return [];

    const dateMap = {};
    for (const variant of results) {
      for (const day of variant.daily_data) {
        if (!dateMap[day.date]) {
          dateMap[day.date] = { date: day.date, units: 0, revenue: 0, lower: 0, upper: 0 };
        }
        dateMap[day.date].units += day.units;
        dateMap[day.date].revenue += day.revenue;
        dateMap[day.date].lower += day.lower;
        dateMap[day.date].upper += day.upper;
      }
    }

    const prevDateMap = {};
    if (previousResults?.length) {
      for (const variant of previousResults) {
        for (const day of variant.daily_data) {
          if (!prevDateMap[day.date]) {
            prevDateMap[day.date] = { date: day.date, units: 0, revenue: 0 };
          }
          prevDateMap[day.date].units += day.units;
          prevDateMap[day.date].revenue += day.revenue;
        }
      }
    }

    const allDates = Object.keys(dateMap).sort();
    const visibleDates = allDates.slice(0, viewPeriod);

    return visibleDates
      .map((d) => ({
        ...dateMap[d],
        [`${metric}_prev`]: prevDateMap[d]?.[metric] ?? null,
      }));
  }, [results, previousResults, metric, viewPeriod]);

  const totals = useMemo(() => {
    if (!results?.length) return { units: 0, revenue: 0 };
    return results.reduce(
      (acc, v) => ({ units: acc.units + v.total_units, revenue: acc.revenue + v.total_revenue }),
      { units: 0, revenue: 0 }
    );
  }, [results]);

  if (!results?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="barChart2" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No forecastable variants</p>
          <p className="max-w-sm text-center text-xs">
            Complete orders with at least 7 days of sales history to generate demand predictions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Daily Forecast</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {metric === "units" ? `${totals.units.toLocaleString()} units` : `₱${totals.revenue.toLocaleString()}`}
          </span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {["units", "revenue"].map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors capitalize",
                  metric === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => {
                const d = new Date(v + "T00:00:00");
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
                const label = name.includes("prev") ? "Previous" : "Forecast";
                const formatted = metric === "revenue" ? `₱${value.toLocaleString()}` : value.toLocaleString();
                return [formatted, label];
              }}
              labelFormatter={(label) => {
                const d = new Date(label + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey={metric}
              name="Forecast"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#colorForecast)"
              dot={false}
            />
            {chartData.some((d) => d[`${metric}_prev`] != null) && (
              <Area
                type="monotone"
                dataKey={`${metric}_prev`}
                name="Previous"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                fill="none"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
