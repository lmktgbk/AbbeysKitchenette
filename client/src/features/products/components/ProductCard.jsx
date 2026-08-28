import { Badge } from "@/components/ui/badge";
import ImagePlaceholder from "@/components/ui/ImagePlaceholder";

/**
 * ProductCard
 *
 * Image-heavy product card with click-to-view detail modal.
 * Shows product image, name, category, price range, and variant count.
 *
 * Props:
 * - product: { product_id, product_name, category_name, image_url, is_available, variant_count, min_price, max_price }
 * - onViewDetail: (product) => void
 */
export default function ProductCard({ product, onViewDetail }) {
  const minPrice = product.min_price ?? 0;
  const maxPrice = product.max_price ?? 0;
  const hasPrice = minPrice != null || maxPrice != null;
  const priceLabel =
    !hasPrice || (minPrice === 0 && maxPrice === 0)
      ? "No price"
      : minPrice === maxPrice
        ? `₱${minPrice.toLocaleString()}`
        : `₱${minPrice.toLocaleString()} – ₱${maxPrice.toLocaleString()}`;

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

        {/* Unavailable overlay */}
        {!product.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              Unavailable
            </span>
          </div>
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
              product.is_available
                ? "bg-success"
                : "bg-destructive"
            }`}
            title={product.is_available ? "Available" : "Unavailable"}
          />
        </div>

        {product.category_name && (
          <Badge variant="outline" className="mb-1.5 text-xs">
            {product.category_name}
          </Badge>
        )}

        <p className="text-xs text-muted-foreground">{priceLabel}</p>
        <p className="text-xs text-muted-foreground">
          {product.variant_count} variant{product.variant_count !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
