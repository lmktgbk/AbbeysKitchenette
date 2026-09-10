import Icon from "@/components/ui/icon";

/**
 * BatchSidebar — shows items grouped by product+variant across all preparing orders.
 * Helps kitchen staff batch-cook the same items.
 *
 * Props:
 * - batches: array of { product_name, size_name, total_quantity, orders[] }
 * - onClose: () => void
 */
export default function BatchSidebar({ batches, onClose }) {
  return (
    <div className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Icon name="list" size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Batch Groups
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Batch List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 modal-scroll">
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/40">
            <Icon name="package" size={24} />
            <p className="text-xs font-medium">No batch groups</p>
          </div>
        ) : (
          batches.map((batch, idx) => (
            <div
              key={`${batch.product_id}-${batch.variant_id}-${idx}`}
              className="rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              {/* Product header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground truncate">
                  {batch.product_name}
                </span>
                {batch.size_name && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0 ml-1">
                    {batch.size_name}
                  </span>
                )}
              </div>

              {/* Total quantity */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-lg font-bold text-primary">
                  ×{batch.total_quantity}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  total needed
                </span>
              </div>

              {/* Order breakdown */}
              <div className="space-y-1">
                {batch.orders.map((o) => (
                  <div
                    key={o.order_item_id}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="text-muted-foreground">
                      #{o.order_number}
                    </span>
                    <span className="font-medium text-foreground">
                      ×{o.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
