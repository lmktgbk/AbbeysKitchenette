import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export default function OrderCard({
  order,
  onToggleItem,
  onMarkReady,
  disabled,
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!order) return undefined;
    const start = new Date(order.updated_at || order.created_at).getTime();
    function tick() {
      setElapsed(Date.now() - start);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order]);

  if (!order) return null;

  const isPreparing = order.status === "preparing";
  const isAccepted = order.status === "accepted";
  const isCompleted = order.status === "completed";

  const totalItems = order.items?.length ?? 0;
  const preparedCount = order.items?.filter((i) => i.is_prepared).length ?? 0;
  const allChecked = totalItems > 0 && preparedCount === totalItems;
  const progressPct = totalItems ? Math.round((preparedCount / totalItems) * 100) : 0;

  const m = Math.floor(elapsed / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  const elapsedDisplay = isCompleted
    ? `${order.fulfillment_minutes ?? 0}m`
    : m > 0 ? `${m}m ${s}s` : `${s}s`;
  const isLongWait = !isCompleted && elapsed > 10 * 60000;

  const source = order.order_source === "online" ? "online" : "walk-in";

  return (
    <div className={cn(
      "bg-card border border-border rounded-lg overflow-hidden kds-fade-in flex flex-col",
      isPreparing && "border-primary/40",
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/60 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-[9px] px-1.5 py-px rounded-full font-bold",
              isPreparing
                ? "bg-primary text-primary-foreground"
                : isCompleted
                  ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
            )}>
              {isPreparing ? "PREPARING" : isCompleted ? "DONE" : "ACCEPTED"}
            </span>
            <span className={cn(
              "text-[9px] font-semibold",
              isLongWait ? "kds-timer-pulse text-destructive" : "text-muted-foreground",
            )}>
              {elapsedDisplay}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground">
            {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div className="min-w-0">
            <div className="font-serif text-lg font-bold text-foreground leading-tight">
              #{order.order_number}
            </div>
            <div className="text-xs font-semibold text-foreground/80 truncate">
              {order.customer_name}
            </div>
            <div className="text-[11px] text-muted-foreground">
              T{order.table_number} ·{" "}
              <span className={source === "online" ? "text-purple-500" : "text-amber-500"}>
                {source}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-serif text-base font-bold text-amber-500 leading-tight">
              {`₱${Number(order.total_amount).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="px-3 py-1.5 space-y-0.5 flex-1 min-h-0 overflow-y-auto modal-scroll">
        {order.items?.map((item) => {
          const done = item.is_prepared;
          const label = item.size_name
            ? `${item.product_name} (${item.size_name})`
            : item.product_name;

          if (isPreparing) {
            return (
              <button
                key={item.order_item_id}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded transition-all",
                  "cursor-pointer hover:bg-muted active:scale-[0.995]",
                  done && "opacity-40",
                )}
                onClick={() => onToggleItem?.(order.order_id, item.order_item_id, !done)}
                disabled={disabled}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                  done
                    ? "bg-primary/10 border-primary/25"
                    : "border-border",
                )}>
                  {done && <Icon name="check" size={10} className="text-primary" />}
                </div>
                <span className={cn(
                  "text-[11px] font-medium flex-1 min-w-0 truncate",
                  done && "line-through text-muted-foreground",
                )}>
                  {label}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                  ×{item.quantity}
                </span>
              </button>
            );
          }

          return (
            <div
              key={item.order_item_id}
              className="flex items-center gap-1.5 px-2 py-1"
            >
              <span className="text-[11px] font-medium flex-1 min-w-0 truncate text-foreground/80">
                {label}
              </span>
              <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                ×{item.quantity}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer — pinned to bottom via mt-auto on flex parent */}
      {isPreparing && (
        <div className="px-3 py-2 border-t border-border/60 shrink-0 mt-auto space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-border/60">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background: allChecked ? "hsl(160 50% 40%)" : "hsl(200 70% 55%)",
                  width: `${progressPct}%`,
                }}
              />
            </div>
            <span className={cn("text-[9px] font-semibold tabular-nums", allChecked ? "text-primary" : "text-muted-foreground")}>
              {preparedCount}/{totalItems}
            </span>
          </div>
          <Button
            className={cn(
              "w-full font-bold text-xs py-1.5 rounded-lg",
              allChecked && "kds-pulse-ring",
            )}
            onClick={() => {
              if (!allChecked) {
                toast.error("Check off all items before marking ready");
                return;
              }
              onMarkReady(order.order_id);
            }}
            disabled={disabled || !allChecked}
          >
            <Icon name="check" size={12} />
            {allChecked ? "Mark Ready" : `Done (${preparedCount}/${totalItems})`}
          </Button>
        </div>
      )}

      {isAccepted && (
        <div className="px-3 py-2 border-t border-border/60 shrink-0 mt-auto">
          <Button
            className="w-full font-bold text-xs py-1.5 rounded-lg"
            variant="outline"
            onClick={() => onMarkReady(order.order_id)}
            disabled={disabled}
          >
            <Icon name="play" size={12} />
            Start Preparing
          </Button>
        </div>
      )}
    </div>
  );
}
