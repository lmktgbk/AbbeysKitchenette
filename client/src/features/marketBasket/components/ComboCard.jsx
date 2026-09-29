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
    <div className={`flex h-full flex-col rounded-xl border bg-card p-4 transition-all hover:shadow-sm ${isTop ? "border-primary/40 bg-primary/5 hover:border-primary/60 hover:shadow" : "border-border hover:border-primary/30"}`}>
      {isTop && (
        <span className="mb-2 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/30">
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

      {/* Evaluation metrics — the paper's Support / Confidence / Lift, per rule */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div title="Share of all baskets containing both items" className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Support</p>
          <p className="text-sm font-semibold text-foreground">{(rule.support * 100).toFixed(2)}%</p>
          <p className="text-[10px] text-muted-foreground">{totalOrders ? `${Math.round(rule.support * totalOrders)} baskets` : "co-occurrence"}</p>
        </div>
        <div title="Share of A-buyers who also take B" className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Confidence</p>
          <p className="text-sm font-semibold text-foreground">{(rule.confidence * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">of A-buyers</p>
        </div>
        <div title="How many times more likely together than by coincidence (1.0 = independent)" className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lift</p>
          <p className="text-sm font-semibold text-foreground">{rule.lift.toFixed(2)}×</p>
          <p className="text-[10px] text-muted-foreground">vs coincidence</p>
        </div>
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
