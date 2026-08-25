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

/**
 * ProductDetailModal
 *
 * Read-only detail view of a product with variants and recipes.
 * Opens when user clicks a ProductCard.
 * Action buttons at the bottom: Edit, Deactivate/Activate, Delete.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - product: object (list-level data from ProductCard)
 * - detail: object | null (full detail with variants + recipes, from useProductDetail)
 * - loading: boolean — true while fetching detail
 * - onEdit: (product) => void
 * - onDeactivate: (product) => void
 * - onActivate: (product) => void
 * - onDelete: (product) => void
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
}) {
  const [expandedVariants, setExpandedVariants] = useState(new Set());

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

  function handleDeactivate() {
    onDeactivate(product);
    onOpenChange(false);
  }

  function handleActivate() {
    onActivate(product);
    onOpenChange(false);
  }

  function handleDelete() {
    onDelete(product);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogClose onClick={() => onOpenChange(false)} />

        <DialogHeader>
          <DialogTitle>{loading ? "Loading..." : data.product_name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* Product Info — image left, details right */}
            <div className="flex gap-4">
              {/* Image */}
              <div className="h-32 w-40 shrink-0 overflow-hidden rounded-lg border border-border">
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
                      data.is_available ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {data.is_available ? "Active" : "Unavailable"}
                  </span>
                </div>

                <p className="text-sm font-medium text-foreground">{priceLabel}</p>

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
                        {/* Variant header — clickable */}
                        <button
                          type="button"
                          onClick={() => toggleVariant(variant.variant_id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
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
                          </div>

                          <div className="flex items-center gap-2">
                            {variant.hasTransactions && (
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
                          </div>
                        </button>

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
          <Button size="sm" variant="secondary" onClick={handleEdit}>
            <Icon name="pencil" size={14} className="mr-1" />
            Edit
          </Button>

          {data.is_available ? (
            <Button size="sm" variant="secondary" onClick={handleDeactivate}>
              <Icon name="eyeOff" size={14} className="mr-1" />
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleActivate}>
              <Icon name="eye" size={14} className="mr-1" />
              Activate
            </Button>
          )}

          <Button size="sm" variant="destructive" onClick={handleDelete}>
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
    <div className="flex gap-4">
      <Skeleton className="h-32 w-40 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
