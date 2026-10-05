import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import ImagePlaceholder from "@/components/ui/ImagePlaceholder";
import { bulkVariantActions, isProductActive } from "../product.utils";

/**
 * ProductDetailModal
 *
 * Read-only detail view of a product with variants and recipes.
 * Opens when user clicks a ProductCard.
 * Action buttons at the bottom: Edit, Deactivate/Activate, Delete.
 * Per-variant activate/deactivate toggles in variant accordion headers.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - product: object (list-level data from ProductCard)
 * - detail: object | null (full detail with variants + recipes, from useProductDetail)
 * - loading: boolean — true while fetching detail
 * - onEdit: (product) => void
 * - onDeactivate/onActivate/onDelete: async (product) => boolean; true on confirmed success
 * - onActivateVariant: (product, variant) => void
 * - onDeactivateVariant: (product, variant) => void
 */
export default function ProductDetailModal({
  open,
  onOpenChange,
  product,
  detail,
  loading = false,
  onEdit,
  onDeactivate,
  onActivate,
  onDelete,
  onActivateVariant,
  onDeactivateVariant,
}) {
  const [expandedVariants, setExpandedVariants] = useState(new Set());
  const [actionPending, setActionPending] = useState(false);

  if (!product) return null;

  const data = detail || product;
  const variants = data.variants ?? [];

  const minPrice = data.min_price ?? 0;
  const maxPrice = data.max_price ?? 0;
  const priceLabel =
    minPrice === 0 && maxPrice === 0
      ? "No price"
      : minPrice === maxPrice
        ? `₱${minPrice.toLocaleString()}`
        : `₱${minPrice.toLocaleString()} – ₱${maxPrice.toLocaleString()}`;

  function toggleVariant(variantId) {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedVariants(new Set(variants.map((v) => v.variant_id)));
  }

  function collapseAll() {
    setExpandedVariants(new Set());
  }

  function handleEdit() {
    onEdit(product);
    onOpenChange(false);
  }

  /** Keep the nested confirmation's container mounted until the mutation finishes.
   * Cancellation and handled API failures return false and preserve the detail
   * view. The pending guard prevents overlapping product actions in this modal.
   */
  async function confirmAction(action) {
    if (actionPending) return;
    setActionPending(true);
    try {
      if (await action(product)) onOpenChange(false);
    } finally {
      setActionPending(false);
    }
  }

  const { canActivate, canDeactivate } = bulkVariantActions(data);
  const actionsDisabled = loading || !detail || actionPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!actionPending) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogClose disabled={actionPending} onClick={() => { if (!actionPending) onOpenChange(false); }} />

        <DialogHeader>
          <DialogTitle>{loading ? "Loading..." : data.product_name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* Product Info — image left, details right; stacks on mobile */}
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Image */}
              <div className="h-32 w-full shrink-0 overflow-hidden rounded-lg border border-border sm:w-40">
                <ImagePlaceholder
                  src={data.image_url}
                  alt={data.product_name}
                  className="h-full w-full"
                />
              </div>

              {/* Details */}
              <div className="flex flex-1 flex-col gap-1.5">
                {data.category_name && (
                  <Badge variant="outline" className="w-fit text-xs">
                    {data.category_name}
                  </Badge>
                )}

                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isProductActive(data)
                        ? "bg-success"
                        : "bg-destructive"
                    }`}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {isProductActive(data)
                      ? "Active"
                      : "Unavailable"}
                  </span>
                </div>

                <p className="text-sm font-semibold text-foreground">{priceLabel}</p>

                <p className="text-xs text-muted-foreground">
                  {variants.length} variant{variants.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Variants Section */}
            {variants.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Variants</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={expandAll}
                      className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Expand all
                    </button>
                    <button
                      onClick={collapseAll}
                      className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Collapse all
                    </button>
                  </div>
                </div>

                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {variants.map((variant) => {
                    const isExpanded = expandedVariants.has(variant.variant_id);
                    const recipes = variant.recipes ?? [];

                    return (
                      <div
                        key={variant.variant_id}
                        className="rounded-lg border border-border"
                      >
                        {/* Keep the expand control and mutation button as siblings;
                            nesting buttons creates invalid markup and ambiguous keyboard actions. */}
                        <div
                          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <button type="button" onClick={() => toggleVariant(variant.variant_id)}
                            aria-expanded={isExpanded} className="flex flex-1 items-center gap-2 text-left">
                            <Icon
                              name={isExpanded ? "chevronDown" : "chevronRight"}
                              size={14}
                              className="text-muted-foreground"
                            />
                            <span className="text-sm font-medium text-foreground">
                              {variant.size_name}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ₱{Number(variant.price).toLocaleString()}
                            </span>
                          </button>

                          <div className="flex items-center gap-2">
                            {variant.has_transactions && (
                              <Icon
                                name="lock"
                                size={12}
                                className="text-muted-foreground"
                                title="Has transactions — cannot rename"
                              />
                            )}
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                variant.is_stock_sufficient ? "bg-green-500" : "bg-red-500"
                              }`}
                              title={variant.is_stock_sufficient ? "In stock" : "Insufficient ingredients"}
                            />
                            <Button
                              size="sm"
                              variant={variant.is_available && variant.is_stock_sufficient ? "destructive" : "outline"}
                              className="h-6 px-2 text-xs"
                              disabled={actionPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                variant.is_available && variant.is_stock_sufficient
                                  ? onDeactivateVariant(product, variant)
                                  : onActivateVariant(product, variant);
                              }}
                            >
                              {variant.is_available && variant.is_stock_sufficient ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </div>

                        {/* Variant body — recipes */}
                        {isExpanded && (
                          <div className="border-t border-border px-3 py-2">
                            {recipes.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No ingredients added yet.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {recipes.map((recipe) => (
                                  <div
                                    key={recipe.recipe_id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-foreground">
                                      {recipe.ingredient_name ?? "Unknown"}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {recipe.quantity_needed} {recipe.unit ?? ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={handleEdit} disabled={actionsDisabled}>
            <Icon name="pencil" size={14} className="mr-1" />
            Edit
          </Button>

            <Button size="sm" variant="outline" onClick={() => confirmAction(onDeactivate)} disabled={actionsDisabled || !canDeactivate}>
              <Icon name="eyeOff" size={14} className="mr-1" />
              Deactivate All
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirmAction(onActivate)} disabled={actionsDisabled || !canActivate}>
              <Icon name="eye" size={14} className="mr-1" />
              Activate All
            </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => confirmAction(onDelete)}
            disabled={actionsDisabled}
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <Icon name="trash2" size={14} className="mr-1" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Skeleton className="h-32 w-full rounded-lg sm:w-40" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
