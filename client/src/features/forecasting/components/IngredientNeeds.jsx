import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DropDown } from "@/components/filters/DropDown";

const STATUS_CONFIG = {
  ok: { variant: "success", label: "OK" },
  warning: { variant: "warning", label: "Low Stock" },
  critical: { variant: "destructive", label: "Critical" },
};

/**
 * IngredientNeeds — ingredient requirements from forecast, per date, with stock status.
 */
export default function IngredientNeeds({ ingredients, viewPeriod = 14 }) {
  if (!ingredients?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No ingredient data available
        </div>
      </div>
    );
  }

  const allDates = useMemo(() => {
    const dateSet = new Set();
    for (const ing of ingredients) {
      for (const dv of ing.daily_values) dateSet.add(dv.date);
    }
    return Array.from(dateSet).sort().slice(0, viewPeriod);
  }, [ingredients, viewPeriod]);

  const critical = ingredients.filter((i) => i.status === "critical");
  const warning = ingredients.filter((i) => i.status === "warning");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Ingredient Needs</h3>
        <div className="flex items-center gap-2">
          {critical.length > 0 && (
            <Badge variant="destructive">{critical.length} critical</Badge>
          )}
          {warning.length > 0 && (
            <Badge variant="warning">{warning.length} low</Badge>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ingredient</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Unit</th>
              {allDates.map((d) => (
                <th key={d} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                  {new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Stock</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Days Left</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing) => {
              const sc = STATUS_CONFIG[ing.status] || STATUS_CONFIG.ok;
              const dateMap = {};
              for (const dv of ing.daily_values) dateMap[dv.date] = dv.quantity;

              return (
                <tr key={ing.ingredient_id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2.5 font-medium text-foreground">{ing.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ing.unit}</td>
                  {allDates.map((d) => (
                    <td key={d} className="px-3 py-2.5 text-right text-foreground">
                      {dateMap[d]?.toLocaleString() ?? "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                    {ing.total_needed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {ing.current_stock.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground">
                    {ing.days_covered != null ? `${ing.days_covered}d` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant={sc.variant}>{sc.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
