import { useQuery } from "@tanstack/react-query";
import { getActiveAlertsRequest } from "../../api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * StockAlerts
 *
 * Sidebar panel showing active low-stock and out-of-stock alerts.
 * Each alert has a "Restock Now" button that triggers onRestock.
 *
 * Props:
 * - onRestock: (ingredient) => void
 */
export default function StockAlerts({ onRestock }) {
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ["ingredients-alerts"],
    queryFn: getActiveAlertsRequest,
  });

  const alerts = alertsData?.data?.alerts ?? [];

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="alertTriangle" size={16} className="text-yellow-600 dark:text-yellow-400" />
          <h3 className="text-sm font-semibold text-foreground">
            Stock Alerts
          </h3>
          {alerts.length > 0 && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              {alerts.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-14 rounded-md" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Icon name="checkCircle" size={24} className="mx-auto mb-2 text-green-500" />
            <p className="text-sm text-muted-foreground">All stocked up!</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.alert_id}
                alert={alert}
                onRestock={onRestock}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert, onRestock }) {
  const isOut = alert.alert_type === "out_of_stock";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <div
        className={`h-2 w-2 shrink-0 rounded-full ${
          isOut ? "bg-red-500" : "bg-yellow-500"
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {alert.ingredient_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {isOut
            ? "Out of stock"
            : `${alert.stock_at_trigger} ${alert.unit} remaining`}
        </p>
      </div>

      {/* Restock button */}
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          onRestock({
            ingredient_id: alert.ingredient_id,
            ingredient_name: alert.ingredient_name,
            unit: alert.unit,
            stock_quantity: alert.stock_at_trigger,
          })
        }
      >
        Restock
      </Button>
    </div>
  );
}
