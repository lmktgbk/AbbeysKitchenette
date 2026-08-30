import { useRestockForecast } from "../query";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

const URGENCY_CONFIG = {
  critical: { variant: "destructive", label: "Critical", bg: "bg-destructive/5 border-l-2 border-l-destructive" },
  warning: { variant: "warning", label: "Warning", bg: "bg-yellow-500/5 border-l-2 border-l-yellow-500" },
  ok: { variant: "success", label: "OK", bg: "" },
};

export default function RestockAlertsTab() {
  const { data, isLoading, error } = useRestockForecast();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error) return null;

  const forecastData = data?.data;
  if (!forecastData) return null;

  const { ingredients = [], critical_count = 0, warning_count = 0, ok_count = 0 } = forecastData;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-lg font-bold text-destructive">{critical_count}</p>
            <Badge variant="destructive">≤3 days</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Warning</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-lg font-bold text-yellow-600">{warning_count}</p>
            <Badge variant="warning">≤7 days</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OK</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-lg font-bold text-green-600">{ok_count}</p>
            <Badge variant="success">&gt;7 days</Badge>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Ingredient Stock Status</h3>
        </div>
        {ingredients.length === 0 ? (
          <div className="py-16 text-center">
            <Icon name="package" size={48} className="mx-auto text-muted-foreground/30" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No ingredient data available</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Daily Usage</TableHead>
                <TableHead className="text-center">Days Left</TableHead>
                <TableHead className="text-right">Suggested Reorder</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((item) => {
                const config = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG.ok;
                return (
                  <TableRow key={item.ingredient_id} className={config.bg}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.urgency === "critical" && (
                          <Icon name="alertTriangle" size={14} className="text-destructive" />
                        )}
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">({item.unit})</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.current_stock} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {item.daily_consumption} {item.unit}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono text-sm font-medium ${
                        item.urgency === "critical" ? "text-destructive" :
                        item.urgency === "warning" ? "text-yellow-600" :
                        "text-green-600"
                      }`}>
                        {item.days_until_stockout != null ? `${item.days_until_stockout} days` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {item.suggested_reorder_qty > 0
                        ? `${item.suggested_reorder_qty} ${item.unit}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
