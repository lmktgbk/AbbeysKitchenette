import { memo } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

/**
 * ComboCard — Promotion card (FP-Growth)
 * All cards show the same format: names, stats, pricing, Create Promotion.
 * Props:
 * - rule: { id, product_a, product_b, size_name_a, size_name_b, support, confidence, lift, pricing }
 * - onCreateCombo: (rule) => void
 * - isTop: boolean
 */
function ComboCard({ rule, onCreateCombo, isTop, totalOrders }) {

  return (
    <div className={`flex h-full flex-col rounded-xl border bg-card p-4 transition-all hover:shadow-sm ${isTop ? "border-amber-300 bg-amber-50/30 hover:border-amber-400 hover:shadow" : "border-border hover:border-primary/30"}`}>
      {isTop && (
        <span className="mb-2 inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          ★ Top Promotion
        </span>
      )}
      {/* Product pairing — clean single line */}
      <div className="min-h-[40px]">
        <p className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
          {rule.product_a} <span className="text-xs font-normal text-muted-foreground">({rule.size_name_a})</span>
          <span className="mx-1 text-xs font-normal text-muted-foreground">+</span>
          {rule.product_b} <span className="text-xs font-normal text-muted-foreground">({rule.size_name_b})</span>
        </p>
      </div>

      {/* Stats — sentence, plain */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{totalOrders ? `${Math.round(rule.support * totalOrders)} orders bought together` : `${(rule.support * 100).toFixed(1)}% bought together`}</span>
        <span>·</span>
        <span>{rule.confidence >= 0.5 ? "Half also buy" : `${(rule.confidence * 100).toFixed(0)}% also buy`}</span>
        <span
          title={`Lift ${rule.lift.toFixed(1)}× — support ${(rule.support*100).toFixed(1)}%, confidence ${(rule.confidence*100).toFixed(0)}%`}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            rule.lift >= 2
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : rule.lift >= 1.5
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {rule.lift >= 2 ? "Pairs well" : "Often together"}
        </span>
      </div>

      {/* Pricing preview — flex-1 to align buttons */}
      {rule.pricing && (
        <div className="mt-3 flex-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Combined price:</span>
            <span className="font-mono text-foreground">
              ₱{rule.pricing.price_a} + ₱{rule.pricing.price_b} = ₱{rule.pricing.total_price}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Suggested price:</span>
            <span className="font-mono font-medium text-foreground">
              ₱{rule.pricing.suggested_price}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost:</span>
            <span className="font-mono text-foreground">₱{rule.pricing.total_cogs}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Margin:</span>
            <span className="font-mono text-foreground">{rule.pricing.margin_percent}%</span>
          </div>
        </div>
      )}

      {/* Create Promotion / Already Created button — mt-auto for alignment */}
      {rule.combo_exists ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-auto w-full text-xs cursor-not-allowed opacity-60"
          disabled
        >
          <Icon name="checkCircle" size={14} className="mr-1" />
          Already Created
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          className="mt-auto w-full text-xs"
          onClick={() => onCreateCombo(rule)}
        >
          <Icon name="plus" size={14} className="mr-1" />
          Create Promotion
        </Button>
      )}
    </div>
  );
}

export default memo(ComboCard);
