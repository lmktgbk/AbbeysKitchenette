import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

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
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon="barChart2"
          title="No product data"
          copy="No completed orders found for the selected period."
          className="h-64 py-0"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-2">
        <table className="w-full border-collapse">
          <thead>
            <tr className="type-small font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="whitespace-nowrap px-4 py-3 text-left">#</th>
              <th className="whitespace-nowrap px-4 py-3 text-left">Product</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Units</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr
                key={i}
                className="text-xs hover:bg-muted/50 transition-colors"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-muted-foreground">{i + 1}</td>
                <td className="max-w-[200px] truncate px-4 py-3 font-medium text-foreground">
                  {p.productName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                  {p.unitsSold}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-foreground">
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
