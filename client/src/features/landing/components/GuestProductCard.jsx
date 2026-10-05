import Icon from "@/components/ui/icon";

/** Opens variant selection for a menu product; adding to the cart remains the page’s responsibility. */
export default function ProductCard({ product, onOpenProductModal }) {
    const variants = product.variants ?? [];
    const availableVariants = variants.filter((v) => v.is_available !== false);
    const singleVariant = variants.length === 1 ? variants[0] : null;
    const isFullyUnavailable = product.is_available === false || variants.length === 0 || availableVariants.length === 0;

    return (
        <div
            className={`ord-product-card${isFullyUnavailable ? " unavailable" : ""}`}
            onClick={() => onOpenProductModal(product)}
            role="button"
            tabIndex={0}
            aria-label={`View ${product.product_name}`}
            onKeyDown={event => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault(); onOpenProductModal(product);
                }
            }}
            style={{ cursor: "pointer" }}
        >
            {/* Category badge */}
            {product.category_name && (
                <div className="ord-product-category-badge">{product.category_name}</div>
            )}

            {/* Image */}
            <div className="ord-product-img-wrap">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.product_name}
                        className="ord-product-img"
                        loading="lazy"
                    />
                ) : (
                    <div className="ord-no-image-placeholder">
                        <div className="ord-no-image-box">
                            <Icon name="image" size={18} className="ord-no-image-icon" />
                            <span>No Image</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="ord-product-body">
                <div className="ord-product-name">{product.product_name}</div>
                <div className="ord-product-sub">
                    {singleVariant ? (
                        <div className="ord-product-price">
                            ₱{Number(singleVariant.price).toLocaleString()}
                        </div>
                    ) : (
                        <div className="ord-product-sizes">
                            {availableVariants.length > 0
                                ? `${availableVariants.length} size${availableVariants.length > 1 ? "s" : ""} available`
                                : "Out of stock"}
                        </div>
                    )}
                </div>

                <button
                    className="ord-product-add-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenProductModal(product);
                    }}
                    disabled={isFullyUnavailable}
                >
                    <Icon name="plus" size={14} />
                    {isFullyUnavailable
                        ? "Unavailable"
                        : variants.length > 1
                            ? "Choose Size"
                            : "Add to Cart"}
                </button>
            </div>
        </div>
    );
}
