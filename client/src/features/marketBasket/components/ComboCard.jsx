import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

/**
 * ComboCard
 *
 * Card for displaying an association rule in a grid layout.
 * All cards show the same format: names, stats, explanation, pricing, Create Combo.
 *
 * Props:
 * - rule: { id, product_a, product_b, size_name_a, size_name_b, support, confidence, lift, explanation, pricing }
 * - onCreateCombo: (rule) => void
 */
export default function ComboCard({ rule, onCreateCombo }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight);
    }
  }, [rule.explanation]);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      {/* Product pairing */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="shoppingBag" size={14} className="text-primary" />
          <span>{rule.product_a}</span>
          {rule.size_name_a && (
            <span className="text-xs text-muted-foreground">{rule.size_name_a}</span>
          )}
        </div>
        <span className="text-xs font-bold text-muted-foreground">+</span>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="shoppingBag" size={14} className="text-primary" />
          <span>{rule.product_b}</span>
          {rule.size_name_b && (
            <span className="text-xs text-muted-foreground">{rule.size_name_b}</span>
          )}
        </div>
      </div>

      {/* Stats badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {(rule.support * 100).toFixed(1)}% match
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {(rule.confidence * 100).toFixed(0)}% conf
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            rule.lift >= 2
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : rule.lift >= 1.5
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {rule.lift.toFixed(1)}x lift
        </span>
      </div>

      {/* AI Explanation */}
      {rule.explanation && (
        <div className="mt-3 flex-1">
          <p
            ref={textRef}
            className={`text-xs leading-relaxed text-muted-foreground ${expanded ? "" : "line-clamp-4"}`}
          >
            {rule.explanation}
          </p>
          {isClamped && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-1 text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Pricing preview */}
      {rule.pricing && (
        <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Combined price:</span>
            <span className="text-foreground">
              ₱{rule.pricing.price_a} + ₱{rule.pricing.price_b} = ₱{rule.pricing.total_price}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bundle (15% off):</span>
            <span className="text-foreground">₱{rule.pricing.bundle_price}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Suggested price:</span>
            <span className="font-medium text-foreground">
              ₱{rule.pricing.suggested_price}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost/cup:</span>
            <span className="text-foreground">₱{rule.pricing.total_cogs}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Margin:</span>
            <span className="text-foreground">{rule.pricing.margin_percent}%</span>
          </div>
        </div>
      )}

      {/* Create Combo / Already Created button */}
      {rule.combo_exists ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full text-xs cursor-not-allowed opacity-60"
          disabled
        >
          <Icon name="checkCircle" size={14} className="mr-1" />
          Already Created
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          className="mt-3 w-full text-xs"
          onClick={() => onCreateCombo(rule)}
        >
          <Icon name="plus" size={14} className="mr-1" />
          Create Combo
        </Button>
      )}
    </div>
  );
}
