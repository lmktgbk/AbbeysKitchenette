import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/alerts/ConfirmDialog";
import {
  usePriceSuggestions,
  usePriceOptimizationMutations,
} from "../query";

/**
 * PriceOptimizationModal
 *
 * Modal that shows AI-generated price suggestions for a product's variants.
 * Triggered by clicking "Optimize Price" on a ProductCard.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - product: { product_id, product_name } — the product being optimized
 */
export default function PriceOptimizationModal({ open, onOpenChange, product }) {
  const productId = product?.product_id;
  const { data: suggestionsData, isLoading } = usePriceSuggestions(productId);
  const mutations = usePriceOptimizationMutations();

  const suggestions = suggestionsData?.data?.suggestions ?? [];

  function handleGenerate() {
    if (!productId) return;
    mutations.generate.mutate(productId, {
      onSuccess: (res) => {
        const count = res?.data?.recommendations?.length ?? 0;
        toast.success(`Generated ${count} price suggestion${count !== 1 ? "s" : ""}`);
      },
      onError: (err) => {
        toast.error(err.response?.data?.message || "Failed to generate suggestions");
      },
    });
  }

  async function handleApply(suggestion) {
    const change = Number(suggestion.recommendedPrice) - Number(suggestion.currentPrice);
    const direction = change > 0 ? "increase" : "decrease";
    const arrow = direction === "increase" ? "↑" : "↓";

    const ok = await confirm({
      title: "Apply Price Change?",
      message: `${suggestion.productName} (${suggestion.sizeName})`,
      note: `${direction === "increase" ? "Increase" : "Decrease"} price from ₱${Number(suggestion.currentPrice).toLocaleString()} ${arrow} ₱${Number(suggestion.recommendedPrice).toLocaleString()}?`,
      confirmLabel: "Apply",
      variant: "warning",
    });

    if (ok) {
      mutations.apply.mutate(suggestion.id, {
        onSuccess: () => {
          toast.success(`Price updated to ₱${Number(suggestion.recommendedPrice).toLocaleString()}`);
        },
        onError: (err) => {
          toast.error(err.response?.data?.message || "Failed to apply price");
        },
      });
    }
  }

  async function handleDismiss(suggestion) {
    const ok = await confirm({
      title: "Dismiss Suggestion?",
      message: `Dismiss price suggestion for ${suggestion.productName} (${suggestion.sizeName})?`,
      confirmLabel: "Dismiss",
      variant: "warning",
    });

    if (ok) {
      mutations.dismiss.mutate(suggestion.id, {
        onSuccess: () => {
          toast.success("Suggestion dismissed");
        },
        onError: (err) => {
          toast.error(err.response?.data?.message || "Failed to dismiss");
        },
      });
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="trendingUp" size={18} className="text-primary" />
            Price Optimization
          </DialogTitle>
          <DialogDescription>
            {product?.product_name || "Product"} — AI-powered pricing analysis
          </DialogDescription>
        </DialogHeader>

        {/* Generate button */}
        <Button
          variant="secondary"
          className="w-full"
          onClick={handleGenerate}
          disabled={mutations.generate.isPending}
        >
          {mutations.generate.isPending ? (
            <>
              <Icon name="loader" size={14} className="mr-2 animate-spin" />
              Analyzing prices...
            </>
          ) : (
            <>
              <Icon name="sparkles" size={14} className="mr-2" />
              {suggestions.length > 0 ? "Regenerate Suggestions" : "Generate Suggestions"}
            </>
          )}
        </Button>

        {/* Suggestions list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Icon name="trendingUp" size={24} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No suggestions yet. Click the button above to analyze pricing.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => {
              const change = Number(s.recommendedPrice) - Number(s.currentPrice);
              const direction = s.direction || (change > 0 ? "increase" : change < 0 ? "decrease" : "keep");
              const isIncrease = direction === "increase";
              const isDecrease = direction === "decrease";

              return (
                <div
                  key={s.id}
                  className="space-y-3 rounded-lg border border-border p-4"
                >
                  {/* Header: name + confidence */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {s.productName} ({s.sizeName})
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(s.confidence * 100)}% confidence
                    </span>
                  </div>

                  {/* Price change display */}
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="text-sm font-semibold text-foreground">
                        ₱{Number(s.currentPrice).toLocaleString()}
                      </p>
                    </div>
                    <Icon
                      name={isIncrease ? "trendingUp" : isDecrease ? "trendingDown" : "minus"}
                      size={18}
                      className={`my-auto ${
                        isIncrease
                          ? "text-green-600"
                          : isDecrease
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    />
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Recommended</p>
                      <p
                        className={`text-sm font-semibold ${
                          isIncrease
                            ? "text-green-600"
                            : isDecrease
                              ? "text-red-600"
                              : "text-foreground"
                        }`}
                      >
                        ₱{Number(s.recommendedPrice).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                        isIncrease
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : isDecrease
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {isIncrease ? "+" : ""}{Number(s.changePercent).toFixed(1)}%
                    </span>
                  </div>

                  {/* Margin + competitor info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>Margin: {Number(s.marginBefore).toFixed(1)}% → {Number(s.marginAfter).toFixed(1)}%</p>
                    {s.competitorAvg && (
                      <p>Competitor avg: ₱{Number(s.competitorAvg).toLocaleString()}</p>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div className="border-t border-border pt-2">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {s.reasoning}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-xs"
                      onClick={() => handleApply(s)}
                      disabled={mutations.apply.isPending}
                    >
                      Apply Price
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleDismiss(s)}
                      disabled={mutations.dismiss.isPending}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
