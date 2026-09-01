import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import SingleDatePicker from "@/components/filters/SingleDatePicker";

const TREND_CONFIG = {
  increasing: { icon: "trendingUp", className: "text-green-600", label: "Increasing" },
  decreasing: { icon: "trendingDown", className: "text-red-600", label: "Decreasing" },
  stable: { icon: "minus", className: "text-muted-foreground", label: "Stable" },
};

/**
 * DemandTable — variant-level demand forecast table with pagination.
 * Accepts selectedVariant prop from parent. When set, filters to that variant only.
 */
export default function DemandTable({ results, skipped = [], previousResults, viewPeriod = 7, selectedVariant }) {
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

    if (selectedVariant && selectedVariant !== "all") {
      list = list.filter((v) => String(v.variant_id) === String(selectedVariant));
    }

    if (search && (!selectedVariant || selectedVariant === "all")) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.product_name.toLowerCase().includes(q) ||
          v.size_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [results, search, selectedVariant]);

  const dates = useMemo(() => {
    if (!filteredResults?.length) return [];
    const dateSet = new Set();
    for (const v of filteredResults) {
      for (const d of v.daily_data) dateSet.add(d.date);
    }
    return Array.from(dateSet).sort().slice(0, viewPeriod);
  }, [filteredResults, viewPeriod]);

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
  const isFiltered = selectedVariant && selectedVariant !== "all";

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [search, selectedDate, selectedVariant]);

  // Pagination
  const startIdx = (currentPage - 1) * pageSize;
  const pagedData = displayData.slice(startIdx, startIdx + pageSize);

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

  // ── All skipped (only when no search active) ──────────
  if (displayData.length === 0 && totalSkipped > 0 && !search) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="alertCircle" size={28} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">
            {isFiltered
              ? "Selected variant was skipped"
              : `All ${totalSkipped} variant${totalSkipped !== 1 ? "s were" : " was"} skipped`
            }
          </p>
          <p className="text-xs text-center max-w-sm">
            {isFiltered
              ? "This variant has insufficient sales data for forecasting."
              : "Insufficient sales data — each variant needs at least 7 days of completed order history."
            }
          </p>
        </div>
      </div>
    );
  }

  // ── No results from search ─────────────────────────
  if (displayData.length === 0 && search) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Demand by Variant</h3>
          <div className="flex items-center gap-2">
            <SearchBar value={search} onChange={setSearch} placeholder="Search variant..." className="w-48" />
          </div>
        </div>
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="search" size={28} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No variants match &quot;{search}&quot;</p>
          <button
            onClick={() => setSearch("")}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      </div>
    );
  }

  // ── Filtered variant not found in forecasted ────────
  if (displayData.length === 0 && isFiltered) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="search" size={28} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">Variant not found in forecast</p>
          <p className="text-xs text-center max-w-sm">
            The selected variant may have been skipped due to insufficient data.
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
          {!isFiltered && (
            <SearchBar value={search} onChange={setSearch} placeholder="Search variant..." className="w-48" />
          )}
          <SingleDatePicker
            value={selectedDate === "all" ? null : selectedDate}
            onChange={(val) => setSelectedDate(val || "all")}
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
            {pagedData.map((v) => {
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

      {totalSkipped > 0 && !isFiltered && (
        <div className="border-t border-border px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Skipped: {totalSkipped} variant{totalSkipped !== 1 ? "s" : ""} (insufficient data)
          </p>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalItems={displayData.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        itemLabel="variants"
      />
    </div>
  );
}
