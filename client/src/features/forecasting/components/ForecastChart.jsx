import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import { SearchableDropDown } from "@/components/filters/SearchableDropDown";
import { FilterPill } from "@/components/filters/FilterPill";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const VIEW_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
];

/**
 * ForecastChart — daily units/revenue area chart.
 * Accepts selectedVariant + onVariantChange from parent for drill-down.
 * When "all", shows aggregate. When specific variant, shows that variant only.
 */
export default function ForecastChart({ results, previousResults, viewPeriod = 7, onViewPeriodChange, selectedVariant, onVariantChange, activeJobLabel, comparisonJobLabel }) {
  const [metric, setMetric] = useState("units");

  const variantOptions = useMemo(() => {
    if (!results?.length) return [];
    return [
      { value: "all", label: "All Variants" },
      ...results.map((v) => ({
        value: String(v.variant_id),
        label: `${v.product_name} (${v.size_name})`,
      })),
    ];
  }, [results]);

  const chartData = useMemo(() => {
    if (!results?.length) return [];

    const filteredResults = selectedVariant === "all" || !selectedVariant
      ? results
      : results.filter((v) => String(v.variant_id) === String(selectedVariant));

    const dateMap = {};
    for (const variant of filteredResults) {
      const price = variant.price || 0;
      for (const day of variant.daily_data) {
        if (!dateMap[day.date]) {
          dateMap[day.date] = {
            date: day.date, units: 0, revenue: 0,
            lower_units: 0, upper_units: 0,
            lower_revenue: 0, upper_revenue: 0,
          };
        }
        dateMap[day.date].units += day.units;
        dateMap[day.date].revenue += day.revenue;
        dateMap[day.date].lower_units += day.lower;
        dateMap[day.date].upper_units += day.upper;
        dateMap[day.date].lower_revenue += day.lower * price;
        dateMap[day.date].upper_revenue += day.upper * price;
      }
    }

    const prevDateMap = {};
    if (previousResults?.length) {
      const prevFiltered = selectedVariant === "all" || !selectedVariant
        ? previousResults
        : previousResults.filter((v) => String(v.variant_id) === String(selectedVariant));

      for (const variant of prevFiltered) {
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

    const isRevenue = metric === "revenue";
    return visibleDates
      .map((d) => ({
        ...dateMap[d],
        lower: isRevenue ? dateMap[d].lower_revenue : dateMap[d].lower_units,
        upper: isRevenue ? dateMap[d].upper_revenue : dateMap[d].upper_units,
        [`${metric}_prev`]: prevDateMap[d]?.[metric] ?? null,
      }));
  }, [results, previousResults, metric, viewPeriod, selectedVariant]);

  const totals = useMemo(() => {
    if (!results?.length) return { units: 0, revenue: 0 };

    const filteredResults = selectedVariant === "all" || !selectedVariant
      ? results
      : results.filter((v) => String(v.variant_id) === String(selectedVariant));

    return filteredResults.reduce(
      (acc, v) => ({
        units: acc.units + v.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.units, 0),
        revenue: acc.revenue + v.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.revenue, 0),
      }),
      { units: 0, revenue: 0 }
    );
  }, [results, viewPeriod, selectedVariant]);

  const hasPrevious = chartData.some((d) => d[`${metric}_prev`] != null);

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Daily Forecast</h3>
          {hasPrevious && (
            <p className="text-[11px] text-muted-foreground">
              Comparing {activeJobLabel} with {comparisonJobLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {metric === "units"
              ? `${totals.units.toLocaleString()} units`
              : `₱${totals.revenue.toLocaleString()}`
            }
          </span>

          <SearchableDropDown
            options={variantOptions}
            value={selectedVariant === "all" || !selectedVariant ? "all" : String(selectedVariant)}
            onChange={(val) => onVariantChange?.(val)}
            placeholder="All Variants"
            searchPlaceholder="Search variant..."
            className="w-56"
          />

          <FilterPill
            options={VIEW_OPTIONS}
            value={String(viewPeriod)}
            onChange={(val) => onViewPeriodChange?.(val)}
          />

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
      {/* Legend + chart area */}
      <div className="px-4 pt-3 pb-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-sm bg-primary" />
            Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed border-primary" />
            Confidence
          </span>
          {hasPrevious && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 border-t border-dashed border-muted-foreground" />
              Previous
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.35} />
                <stop offset="95%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.18} />
                <stop offset="95%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => {
                const d = new Date(v + "T00:00:00");
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => metric === "revenue" ? `₱${v.toLocaleString()}` : v}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--color-foreground)",
              }}
              formatter={(value, name) => {
                const labels = {
                  "Upper Bound": "Upper Bound",
                  "Lower Bound": "Lower Bound",
                  "Previous": "Previous",
                };
                const label = labels[name] || "Forecast";
                const formatted = metric === "revenue" ? `₱${value.toLocaleString()}` : value.toLocaleString();
                return [formatted, label];
              }}
              labelFormatter={(label) => {
                const d = new Date(label + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              }}
            />
            <Area
              type="monotone"
              dataKey="upper"
              name="Upper Bound"
              stroke="var(--color-primary)"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="url(#colorConfidence)"
              dot={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey={metric}
              name="Forecast"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#colorForecast)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="lower"
              name="Lower Bound"
              stroke="var(--color-primary)"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="none"
              dot={false}
              activeDot={false}
            />
            {chartData.some((d) => d[`${metric}_prev`] != null) && (
              <Area
                type="monotone"
                dataKey={`${metric}_prev`}
                name="Previous"
                stroke="var(--color-muted-foreground)"
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
