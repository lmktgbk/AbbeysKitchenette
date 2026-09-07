import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export default function ProcessingCard({
  order,
  checkedSet,
  onToggleItem,
  onMarkReady,
  animatingOut,
  disabled,
}) {
  const [elapsed, setElapsed] = useState(0);
  const isDisabled = disabled || animatingOut;

  useEffect(() => {
    if (!order) return undefined;
    const start = new Date(order.updated_at).getTime();
    function tick() {
      setElapsed(Date.now() - start);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order]);

  if (!order) {
    return (
      <div className="bg-muted/50 border border-dashed border-border rounded-lg flex-1 flex flex-col items-center justify-center gap-3 py-12">
        <div className="w-16 h-16 rounded-full flex items-center justify-center border border-dashed border-border bg-muted/50">
          <Icon name="check" size={28} className="opacity-30 text-muted-foreground" />
        </div>
        <div className="text-sm font-semibold text-muted-foreground opacity-40">
          No order in preparation
        </div>
        <div className="text-[11px] text-muted-foreground opacity-30">
          Queue is clear · waiting for new orders
        </div>
      </div>
    );
  }

  const checkedCount = checkedSet.size;
  const totalItems = order.items?.length ?? 0;
  const allChecked = totalItems > 0 && checkedCount === totalItems;
  const progressPct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const isLongWait = elapsed > 10 * 60000;

  const m = Math.floor(elapsed / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  const elapsedDisplay = m > 0 ? `${m}m ${s}s` : `${s}s`;

  const source = order.order_source === "online" ? "online" : "walk-in";

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0 kds-pop-in",
        animatingOut && "kds-order-complete",
      )}
    >
      {/* Header */}
      <div className="relative px-5 pt-5 pb-4 border-b border-border/60">
        <div className="flex items-start justify-between mb-3">
          <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-bold">
            NOW PREPARING
          </span>
          <div className="text-right">
            <div className="font-mono text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </div>
            <div
              className={cn(
                "text-[11px]",
                isLongWait ? "kds-timer-pulse font-bold text-destructive" : "font-semibold text-muted-foreground",
              )}
            >
              {"\u23F1"} {elapsedDisplay}
            </div>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="font-serif text-3xl font-bold text-foreground">
              #{order.order_number}
            </div>
            <div className="text-lg font-semibold mt-0.5 text-foreground/80">
              {order.customer_name}
            </div>
            <div className="text-sm mt-0.5 text-muted-foreground">
              Table {order.table_number} ·{" "}
              <span className={source === "online" ? "text-purple-500" : "text-amber-500"}>
                {source}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Total
            </div>
            <div className="font-serif text-2xl font-bold text-amber-500">
              {`\u20B1${Number(order.total_amount).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 modal-scroll">
        <div className="text-[9px] uppercase tracking-widest mb-1 font-semibold text-muted-foreground">
          Items to Prepare · tap to check off
        </div>
        {order.items?.map((item, i) => {
          const done = checkedSet.has(i);
          const label = item.size_name
            ? `${item.product_name} (${item.size_name})`
            : item.product_name;
          return (
            <button
              key={item.order_item_id ?? i}
              type="button"
              className={cn(
                "flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 bg-background border border-border rounded-lg cursor-pointer transition-all hover:bg-muted active:scale-[0.995] disabled:cursor-default",
                done && "opacity-45",
              )}
              onClick={() => onToggleItem(order.order_id, i)}
              disabled={isDisabled}
            >
              <div
                className={cn(
                  "w-[22px] h-[22px] rounded-md border border-border flex items-center justify-center shrink-0 pointer-events-none transition-all",
                  done && "bg-primary/10 border-primary/25",
                )}
              >
                {done && <Icon name="check" size={14} className="text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-semibold", done && "line-through text-muted-foreground")}>
                  {label}
                </div>
              </div>
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-sm">
                ×{item.quantity}
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress + Button */}
      <div className="px-5 pb-5 pt-3 border-t border-border/60 space-y-3">
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground">Prep progress</span>
            <span className={cn("text-[10px] font-semibold", allChecked ? "text-primary" : "text-muted-foreground")}>
              {checkedCount} / {totalItems} items checked
            </span>
          </div>
          <div className="h-1 rounded-full bg-border/60">
            <div
              style={{
                height: "100%",
                borderRadius: 99,
                background: allChecked ? "hsl(160 50% 40%)" : "hsl(200 70% 55%)",
                width: `${progressPct}%`,
                transition: "width .3s ease",
              }}
            />
          </div>
        </div>
        <Button
          className={cn(
            "w-full bg-primary text-primary-foreground font-bold text-[15px] px-6 py-3.5 rounded-lg cursor-pointer transition-all hover:ring-2 hover:ring-ring active:scale-[0.98]",
            allChecked && "kds-pulse-ring",
          )}
          onClick={() => onMarkReady(order)}
          disabled={isDisabled || !allChecked}
        >
          <Icon name="check" size={16} />
          {allChecked ? "Mark Order as Ready" : `Check all items (${checkedCount}/${totalItems})`}
        </Button>
      </div>
    </div>
  );
}
