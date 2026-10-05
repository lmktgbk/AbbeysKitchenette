import { useState } from "react";
import Icon from "@/components/ui/icon";
import GuestDialog from "./GuestDialog";
import { MAX_QUANTITY } from "../cart";

/** Collects a variant and bounded quantity before handing the selection to the page’s cart owner. */
export default function CustomerProductDetailModal({ product, onAddToCart, onClose }) {
    const variants = product.variants ?? [];
    const availableVariants = variants.filter((v) => v.is_available !== false);

    const [selectedVariantId, setSelectedVariantId] = useState(() => {
        return availableVariants.length > 0
            ? availableVariants[0].variant_id
            : variants[0]?.variant_id ?? null;
    });

    const [quantity, setQuantity] = useState(1);

    const selectedVariant = variants.find((v) => v.variant_id === selectedVariantId) || variants[0];
    const isAvailable = product.is_available !== false && selectedVariant && selectedVariant.is_available !== false && !selectedVariant.is_manually_deactivated;
    const isFullyUnavailable = variants.length === 0 || availableVariants.length === 0;

    const prices = variants.map((v) => Number(v.price)).filter((p) => !isNaN(p));
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const priceLabel =
        prices.length === 0
            ? "No price"
            : minPrice === maxPrice
                ? `₱${minPrice.toLocaleString()}`
                : `₱${minPrice.toLocaleString()} – ₱${maxPrice.toLocaleString()}`;

    const handleAddToCart = () => {
        if (!selectedVariant || isFullyUnavailable || !isAvailable) return;
        onAddToCart({
            product_id: product.product_id,
            variant_id: selectedVariant.variant_id,
            product_name: product.product_name,
            size_name: selectedVariant.size_name !== "Default" ? selectedVariant.size_name : null,
            quantity: quantity,
            unit_price: Number(selectedVariant.price),
        });
        onClose();
    };

    return (
        <GuestDialog className="ord-detail-modal-overlay" label={product.product_name} onClose={onClose}>
            <div className="ord-detail-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="ord-detail-header">
                    <h3 className="ord-detail-title">{product.product_name}</h3>
                    <button className="ord-detail-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="ord-detail-body">
                    {/* Top layout: Image + Info */}
                    <div className="ord-detail-top">
                        <div className="ord-detail-img-wrap">
                            {product.image_url ? (
                                <img
                                    src={product.image_url}
                                    alt={product.product_name}
                                    className="ord-detail-img"
                                />
                            ) : (
                                <div className="ord-detail-no-img">
                                    <Icon name="image" size={22} />
                                    <span>No Image</span>
                                </div>
                            )}
                        </div>

                        <div className="ord-detail-info">
                            {product.category_name && (
                                <div className="ord-detail-badges">
                                    <span className="ord-detail-cat-badge">{product.category_name}</span>
                                </div>
                            )}

                            <div className="ord-detail-price">{priceLabel}</div>

                            <div className="ord-detail-variants-count">
                                {variants.length > 1
                                    ? `${variants.length} variants`
                                    : variants.length === 1
                                        ? "1 size available"
                                        : "No variants"}
                            </div>
                        </div>
                    </div>

                    {/* Description Section */}
                    {product.description && (
                        <div className="ord-detail-desc-box">
                            <div className="ord-detail-desc-title">Description</div>
                            <p className="ord-detail-desc-text">{product.description}</p>
                        </div>
                    )}

                    {/* Variants Section */}
                    {variants.length > 0 && (
                        <div className="ord-detail-variants-section">
                            <div className="ord-detail-section-title">
                                <span>Variants</span>
                                {variants.length > 1 && (
                                    <span style={{ fontSize: "0.75rem", color: "#7c5c3e", fontWeight: 500 }}>
                                        Select size:
                                    </span>
                                )}
                            </div>

                            <div className="ord-detail-variant-list">
                                {variants.map((v) => {
                                    const vAvailable = v.is_available !== false && !v.is_manually_deactivated;
                                    const isSelected = v.variant_id === selectedVariantId;
                                    return (
                                        <button
                                            type="button"
                                            key={v.variant_id}
                                            className={`ord-detail-variant-row ${isSelected ? "selected" : ""} ${!vAvailable ? "disabled" : ""}`}
                                            onClick={() => vAvailable && setSelectedVariantId(v.variant_id)}
                                            aria-pressed={isSelected}
                                            disabled={!vAvailable}
                                        >
                                            <div className="ord-detail-v-left">
                                                <div className="ord-detail-v-radio">
                                                    {isSelected && <div className="ord-detail-v-radio-inner" />}
                                                </div>
                                                <div>
                                                    <div className="ord-detail-v-name">
                                                        {v.size_name === "Default" ? "Regular" : v.size_name}
                                                    </div>
                                                    {!vAvailable && (
                                                        <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>
                                                            Out of stock
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="ord-detail-v-price">
                                                ₱{Number(v.price).toLocaleString()}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer: Quantity & Add to Cart */}
                <div className="ord-detail-footer">
                    <div className="ord-detail-qty-ctrl">
                        <button
                            className="ord-detail-qty-btn"
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            disabled={quantity <= 1 || isFullyUnavailable || !isAvailable}
                        >
                            −
                        </button>
                        <span className="ord-detail-qty-val">{quantity}</span>
                        <button
                            className="ord-detail-qty-btn"
                            onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                            disabled={quantity >= MAX_QUANTITY || isFullyUnavailable || !isAvailable}
                        >
                            +
                        </button>
                    </div>

                    <button
                        className="ord-detail-add-btn"
                        onClick={handleAddToCart}
                        disabled={isFullyUnavailable || !isAvailable}
                    >
                        <Icon name="plus" size={16} />
                        {isFullyUnavailable || !isAvailable
                            ? "Unavailable"
                            : `Add to Cart — ₱${((Number(selectedVariant?.price) || 0) * quantity).toLocaleString()}`}
                    </button>
                </div>
            </div>
        </GuestDialog>
    );
}
