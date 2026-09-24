import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * PosOrderSummary
 *
 * Right panel of the POS showing order items, customer info, and place order button.
 * Payment is handled in a separate modal.
 */
export default function PosOrderSummary({
  items,
  customerName,
  tableName,
  onCustomerNameChange,
  onTableNameChange,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
}) {
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Current Order</h2>
      </div>

      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Customer</label>
          <Input
            value={customerName}
            onChange={(e) => onCustomerNameChange?.(e.target.value)}
            placeholder="Customer name"
            className="h-8 text-sm placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Table</label>
          <Input
            value={tableName}
            onChange={(e) => onTableNameChange?.(e.target.value)}
            placeholder="Table number"
            className="h-8 text-sm placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Icon name="cart" size={32} className="text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">Add items from the menu</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <OrderRow
                key={`${item.variant_id}-${idx}`}
                item={item}
                onUpdateQuantity={(qty) => onUpdateQuantity?.(idx, qty)}
                onRemoveItem={() => onRemoveItem?.(idx)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
          <span className="text-lg font-bold">₱{subtotal.toLocaleString()}</span>
        </div>

        <Button
          fullWidth
          disabled={items.length === 0 || !customerName || !tableName}
          onClick={onPlaceOrder}
        >
          Place Order
        </Button>
      </div>
    </div>
  );
}

/**
 * OrderRow — single cart line with tap-to-expand product name.
 *
 * Names clamp to 2 lines by default (short names render unchanged);
 * tapping the name reveals the full text for repeat-order checks.
 */
function OrderRow({ item, onUpdateQuantity, onRemoveItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-transparent bg-muted/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title={item.product_name}
          onClick={() => setExpanded((prev) => !prev)}
          className={`block w-full text-left text-sm font-medium leading-snug ${expanded ? "" : "line-clamp-2"}`}
        >
          {item.product_name}
        </button>
        <p className="truncate text-xs text-muted-foreground">
          {item.size_name} — ₱{Number(item.unit_price).toLocaleString()} each
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => {
            if (item.quantity <= 1) {
              onRemoveItem?.();
            } else {
              onUpdateQuantity?.(item.quantity - 1);
            }
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <Icon name="minus" size={12} />
        </button>
        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
        <button
          onClick={() => onUpdateQuantity?.(item.quantity + 1)}
          className="flex h-6 w-6 items-center justify-center rounded bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <Icon name="plus" size={12} />
        </button>
      </div>

      <p className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
        ₱{(item.unit_price * item.quantity).toLocaleString()}
      </p>
    </div>
  );
}
