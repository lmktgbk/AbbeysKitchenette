import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import ImagePlaceholder from "@/components/ui/ImagePlaceholder";
import { formatPriceRange, productAvailability } from "../product.utils";

/**
 * ProductCard
 *
 * Image-heavy product card with click-to-view detail modal.
 * Status and overlay use effective sellability, with reasons supplied by the backend.
 */
const ProductCard = memo(function ProductCard({ product, onViewDetail, onOptimizePrice }) {
  const { active, status, label, availableCount, total } = productAvailability(product);

  function handleOptimizeClick(e) {
    e.stopPropagation();
    if (onOptimizePrice) onOptimizePrice(product);
  }

  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card transition-all hover:border-muted-foreground/30"
      onClick={() => onViewDetail(product)}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-t-xl">
        <ImagePlaceholder
          src={product.image_url}
          alt={product.product_name}
          fallbackIcon="package"
          objectFit="cover"
          className="h-full w-full rounded-t-xl"
        />

        {/* Only fully unsellable products receive a blocking overlay. */}
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              {label}
            </span>
          </div>
        )}

        {/* Optimize Price button (top-right) */}
        {active && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 h-7 w-7 p-0"
            onClick={handleOptimizeClick}
            title="Optimize Price"
          >
            <Icon name="sparkles" size={14} />
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
            {product.product_name}
          </h3>
          {/* Status dot */}
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
              status === "partial" ? "bg-amber-500" : active ? "bg-success" : "bg-destructive"
            }`}
            title={label}
          />
        </div>

        {(product.subcategory_name ?? product.category_name) && (
          <Badge variant="outline" className="mb-1.5 text-xs">
            {product.subcategory_name ?? product.category_name}
          </Badge>
        )}
        {status === "partial" && <p className="mb-1 text-xs text-amber-700 dark:text-amber-400">{availableCount} of {total} variants available</p>}

        <p className="text-xs text-muted-foreground">
          {formatPriceRange(product.min_price, product.max_price)}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.variant_count} variant{product.variant_count !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
});

export default ProductCard;
