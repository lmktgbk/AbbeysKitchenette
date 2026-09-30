import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/badge";

function MostRestockedTable({ data, isLoading }) {
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
          <Icon name="package" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No restock data</p>
          <p className="max-w-sm text-center text-xs">
            No restock batches found yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Top 10 Most Restocked Ingredients</h3>
      </div>
      <div className="p-2">
        <table className="w-full border-collapse">
          <thead>
            <tr className="type-small font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="whitespace-nowrap px-4 py-3 text-left">#</th>
              <th className="whitespace-nowrap px-4 py-3 text-left">Ingredient</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Restocks</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Total Qty</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr
                key={i}
                className="text-xs hover:bg-muted/50 transition-colors"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-muted-foreground">{i + 1}</td>
                <td className="max-w-[180px] truncate px-4 py-3 font-medium text-foreground">
                  {item.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Pill variant="primary">{item.restockCount}</Pill>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                  {item.totalQuantity} {item.unit}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-foreground">
                  ₱{Number(item.totalCost || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(MostRestockedTable);
