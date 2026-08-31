import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/filters/SearchBar";
import { DropDown } from "@/components/filters/DropDown";

const TREND_CONFIG = {
  increasing: { icon: "trendingUp", className: "text-green-600", label: "Increasing" },
  decreasing: { icon: "trendingDown", className: "text-red-600", label: "Decreasing" },
  stable: { icon: "minus", className: "text-muted-foreground", label: "Stable" },
};

/**
 * DemandTable — variant-level demand forecast table.
 * Shows per-variant units, revenue, trend, filterable by date and search.
 */
export default function DemandTable({ results, skipped = [], previousResults, viewPeriod = 14 }) {
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");

  const dates = useMemo(() => {
    if (!results?.length) return [];
    const dateSet = new Set();
    for (const v of results) {
      for (const d of v.daily_data) dateSet.add(d.date);
    }
    return Array.from(dateSet).sort().slice(0, viewPeriod);
  }, [results, viewPeriod]);

  const dateOptions = useMemo(() => {
    return [{ value: "all", label: "All dates" }, ...dates.map((d) => ({ value: d, label: d }))];
  }, [dates]);

  const prevMap = useMemo(() => {
    if (!previousResults?.length) return {};
    const map = {};
    for (const v of previousResults) {
      map[v.variant_id] = v;
    }
    return map;
  }, [previousResults]);

  const filteredResults = useMemo(() => {
    if (!results?.length) return [];
    let list = results.filter((v) => !v.skipped);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.product_name.toLowerCase().includes(q) ||
          v.size_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [results, search]);

  const displayData = useMemo(() => {
    return filteredResults.map((v) => {
      if (selectedDate === "all") {
        const visibleDaily = v.daily_data.filter((d) => dates.includes(d.date));
        const displayUnits = visibleDaily.reduce((sum, d) => sum + d.units, 0);
        const displayRevenue = visibleDaily.reduce((sum, d) => sum + d.revenue, 0);
        const prevVisible = prevMap[v.variant_id]?.daily_data?.filter((d) => dates.includes(d.date)) || [];
        return {
          ...v,
          displayUnits,
          displayRevenue,
          prev: prevVisible.length
            ? {
                units: prevVisible.reduce((s, d) => s + d.units, 0),
                revenue: prevVisible.reduce((s, d) => s + d.revenue, 0),
              }
            : null,
        };
      }
      const dayData = v.daily_data.find((d) => d.date === selectedDate);
      const prevDay = prevMap[v.variant_id]?.daily_data?.find((d) => d.date === selectedDate);
      return {
        ...v,
        displayUnits: dayData?.units ?? 0,
        displayRevenue: dayData?.revenue ?? 0,
        prev: prevDay ? { units: prevDay.units, revenue: prevDay.revenue } : null,
      };
    });
  }, [filteredResults, selectedDate, prevMap, dates]);

  const totalSkipped = skipped.length;

  // ── Empty: no results at all ────────────────────────
  if (!results?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="table" size={28} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No demand data</p>
          <p className="text-xs">Run a forecast to see variant-level demand predictions.</p>
        </div>
      </div>
    );
  }

  // ── All skipped ─────────────────────────────────────
  if (displayData.length === 0 && totalSkipped > 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="alertCircle" size={28} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">
            All {totalSkipped} variant{totalSkipped !== 1 ? "s were" : " was"} skipped
          </p>
          <p className="text-xs text-center max-w-sm">
            Insufficient sales data — each variant needs at least 7 days of completed order history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Demand by Variant
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({displayData.length} variant{displayData.length !== 1 ? "s" : ""})
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search variant..." className="w-48" />
          <DropDown
            options={dateOptions}
            value={selectedDate}
            onChange={setSelectedDate}
            size="sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Variant</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Size</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Units</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Revenue</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Trend</th>
              {displayData[0]?.prev != null && (
                <>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Prev Units</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Delta</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayData.map((v) => {
              const tc = TREND_CONFIG[v.trend] || TREND_CONFIG.stable;
              const delta = v.prev ? v.displayUnits - v.prev.units : null;
              return (
                <tr key={v.variant_id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2.5 font-medium text-foreground">{v.product_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{v.size_name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                    {v.displayUnits.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground">
                    ₱{v.displayRevenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant={v.trend === "increasing" ? "success" : v.trend === "decreasing" ? "destructive" : "outline"}>
                      <Icon name={tc.icon} size={12} className={cn("mr-1", tc.className)} />
                      {v.trend}
                    </Badge>
                  </td>
                  {v.prev != null && (
                    <>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {v.prev.units.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {delta !== 0 && (
                          <span className={cn("text-xs font-medium", delta > 0 ? "text-green-600" : "text-red-600")}>
                            {delta > 0 ? "+" : ""}{delta}
                          </span>
                        )}
                        {delta === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalSkipped > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Skipped: {totalSkipped} variant{totalSkipped !== 1 ? "s" : ""} (insufficient data)
          </p>
        </div>
      )}
    </div>
  );
}
