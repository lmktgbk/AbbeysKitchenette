import { useState, useEffect, useRef } from "react";
import { usePendingOnlineOrders } from "../query";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import DateRangeFilter from "@/components/filters/DateRangeFilter";

/**
 * PosOnlineOrders
 *
 * Left collapsible sidebar showing pending online orders.
 * Overlays on top of the product grid (absolute positioning).
 * Auto-refreshes every 15 seconds.
 * Cashier can accept (view + process) or reject (cancel) online orders.
 */
export default function PosOnlineOrders({ open, onClose, onAcceptOrder, onRejectOrder }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data: ordersData, isLoading } = usePendingOnlineOrders({
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const orders = ordersData?.data?.orders ?? [];

  if (!open) return null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="absolute inset-0 z-20 bg-black/20"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-80 z-30 border-r border-border bg-card shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Icon name="bell" size={16} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Online Orders
            </span>
            {orders.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {orders.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
          <div className="relative flex-1">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or #..."
              className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          />
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 modal-scroll">
          {isLoading && orders.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/40">
              <Icon name="inbox" size={24} />
              <p className="text-xs font-medium">No pending orders</p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.order_id}
                className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-bold">#{order.order_number}</p>
                  <span className="text-xs font-semibold text-primary">
                    ₱{Number(order.total_amount).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {order.customer_name || "Guest"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Table {order.table_number}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
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
            ))
          )}
        </div>
      </div>
    </>
  );
}
