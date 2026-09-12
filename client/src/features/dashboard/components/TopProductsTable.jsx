import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

function TopProductsTable({ title, data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="barChart2" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No product data</p>
          <p className="max-w-sm text-center text-xs">
            No completed orders found for the selected period.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-2">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr
                key={i}
                className="text-xs hover:bg-muted/50 transition-colors"
              >
                <td className="px-3 py-2 font-bold text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-foreground truncate max-w-[160px]">
                  {p.productName}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {p.unitsSold}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">
                  ₱{Number(p.revenue || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(TopProductsTable);
