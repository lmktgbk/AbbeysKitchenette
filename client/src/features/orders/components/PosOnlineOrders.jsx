import { usePendingOnlineOrders } from "../query";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

/**
 * PosOnlineOrders
 *
 * Horizontal bar at the bottom of the POS showing pending online orders.
 * Auto-refreshes every 15 seconds.
 * Cashier can accept (view + process) or reject (cancel) online orders.
 */
export default function PosOnlineOrders({ onAcceptOrder, onRejectOrder }) {
  const { data: ordersData, isLoading } = usePendingOnlineOrders();
  const orders = ordersData?.data?.orders ?? [];

  if (isLoading || orders.length === 0) return null;

  return (
    <div className="border-t border-border bg-card px-4 py-2">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="bell" size={16} className="text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Online Orders ({orders.length})
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {orders.map((order) => (
          <div
            key={order.order_id}
            className="flex shrink-0 items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
          >
            <div>
              <p className="font-mono text-sm font-bold">#{order.order_number}</p>
              <p className="text-xs text-muted-foreground">
                {order.customer_name} — Table {order.table_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {Number(order.total_amount).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => onAcceptOrder?.(order)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={() => onRejectOrder?.(order)}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
