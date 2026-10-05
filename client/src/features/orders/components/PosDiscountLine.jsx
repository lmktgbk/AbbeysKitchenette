import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SegButton } from "./PosPaymentControls";

// Compact line labels differ from the whole-order fallback labels in the modal.
const ITEM_DISCOUNT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "senior", label: "SNR 20%" },
  { value: "pwd", label: "PWD 20%" },
  { value: "promo", label: "Promo" },
];

/**
 * Displays one line’s discount editor using the modal’s calculation and state.
 * It does not calculate totals or assemble the settlement payload.
 * The row index and setters retain the modal’s existing line-state alignment.
 */
export default function PosDiscountLine({ item, idx, line, calc, expanded, badge, setExpandedIdx, setLineField }) {
  return (
    <div
      className="border-b border-border/50 px-3 py-2 last:border-0"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">
          {item.product_name}
          {item.size_name && <span className="text-muted-foreground"> ({item.size_name})</span>}
          <span className="text-muted-foreground"> ×{item.quantity}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-semibold">
          {!expanded && badge && (
            <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 type-caption font-semibold text-green-600 dark:text-green-400">
              {badge} −₱{calc.amount.toLocaleString()}
            </span>
          )}
          <span>
            ₱{calc.base.toLocaleString()}
            {(expanded || !badge) && calc.amount > 0 && (
              <span className="ml-1 font-medium text-green-600 dark:text-green-400">
                −₱{calc.amount.toLocaleString()}
              </span>
            )}
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? `Hide discount options for ${item.product_name}` : `Add discount for ${item.product_name}`}
            onClick={() => setExpandedIdx(expanded ? null : idx)}
            className={cn(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              expanded && "bg-muted text-foreground",
            )}
          >
            <Icon name="chevronDown" size={14} className={cn("transition-transform", expanded && "rotate-180")} />
          </button>
        </span>
      </div>
      {expanded && (
        <>
      <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        {ITEM_DISCOUNT_OPTIONS.map((opt) => (
          <SegButton
            key={opt.value}
            active={line.type === opt.value}
            onClick={() => {
              setLineField(idx, { type: opt.value });
              if (opt.value === "none") setExpandedIdx(null);
            }}
            className="h-7 whitespace-nowrap px-1 type-small"
          >
            {opt.label}
          </SegButton>
        ))}
      </div>
      {line.type === "senior" || line.type === "pwd" ? (
        <p className="mt-1 type-small text-muted-foreground">
          {line.type === "senior" ? "Senior" : "PWD"} 20% on this item only — locked for this line.
        </p>
      ) : null}
      {line.type === "promo" && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <SegButton
              active={line.promoMode === "percent"}
              onClick={() => setLineField(idx, { promoMode: "percent" })}
              className="h-6 type-small"
            >
              % off
            </SegButton>
            <SegButton
              active={line.promoMode === "amount"}
              onClick={() => setLineField(idx, { promoMode: "amount" })}
              className="h-6 type-small"
            >
              ₱ off
            </SegButton>
          </div>
          <Input
            type="number"
            min="0"
            value={line.promoValue}
            onChange={(e) => setLineField(idx, { promoValue: e.target.value })}
            placeholder={line.promoMode === "percent" ? "Percent (0–100)" : `Peso amount (max ₱${calc.base.toLocaleString()})`}
            className="h-8 text-xs"
          />
          <Input
            value={line.promoLabel}
            onChange={(e) => setLineField(idx, { promoLabel: e.target.value })}
            placeholder="Promo label (optional)"
            className="h-8 text-xs"
          />
        </div>
      )}
      </>
      )}
    </div>
  );
}
