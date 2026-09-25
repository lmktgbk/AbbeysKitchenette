/**
 * OrderingPage — public online ordering (menu grid + cart + checkout + success/tracking).
 * WHY it exists: guest storefront checkout gated by client store-hours check.
 * Query keys consumed: ["guest","menu",params] via useGuestMenu, ["landing","storeSettings"]
 * via useStoreSettings (guest mutations via useGuestOrderMutations). Guards: public route;
 * store-hours gate (isStoreOpenClient); no BR-02 shift gate, no role guards.
 * State: Query [menuData, settingsData] | local [orderSuccess, search, activeCategory, cart, selectedProduct, showCartDrawer, showCheckout, selectedVariantId, quantity, customerName, tableNumber, privacyConsent, errors, linkCopied] | Zustand [].
 */
import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import "../ordering.css";
import { useGuestMenu, useGuestOrderMutations } from "@/features/orders/query";
import OrderStatusStepper from "../components/OrderStatusStepper";
import { orderNumberLabel } from "@/lib/orderNumber";
import { useStoreSettings } from "@/features/landing/query";
import Icon from "@/components/ui/icon";
import { manilaParts } from "@/lib/date";

// Client mirror of server isStoreOpen — MUST follow the Manila business
// clock (same as server/src/utils/storeHours.js), never device-local.
function isStoreOpenClient(storeHours) {
    if (!storeHours) return { isOpen: true, opensAt: null, closesAt: null };
    const { weekday: today, minutes: currentMinutes } = manilaParts();
    const todayHours = storeHours[today];
    if (!todayHours || !todayHours.enabled) {
        return { isOpen: false, opensAt: null, closesAt: null };
    }
    const [openH, openM] = (todayHours.open || "08:00").split(":").map(Number);
    const [closeH, closeM] = (todayHours.close || "20:00").split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
        return { isOpen: false, opensAt: todayHours.open, closesAt: todayHours.close };
    }
    return { isOpen: true, opensAt: todayHours.open, closesAt: todayHours.close };
}

export default function OrderingPage() {
    const [orderSuccess, setOrderSuccess] = useState(null); // { orderId, customerName }

    if (orderSuccess) {
        return <SuccessScreen orderSuccess={orderSuccess} onReset={() => setOrderSuccess(null)} />;
    }

    return <OrderingUI onOrderSuccess={setOrderSuccess} />;
}

/* ─────────────────────────────────────────────────────────────
   ORDERING UI (main layout)
───────────────────────────────────────────────────────────── */
function OrderingUI({ onOrderSuccess }) {
    // ── Store hours ─────────────────────────────
    const { data: settingsData } = useStoreSettings();
    const storeHours = settingsData?.data?.storeHours;
    const { isOpen: storeIsOpen, opensAt, closesAt } = isStoreOpenClient(storeHours);

    const storeClosedMessage = useMemo(() => {
        if (storeIsOpen) return null;
        if (opensAt && closesAt) {
            const fmt = (t) => {
                const [h, m] = t.split(":");
                const hr = parseInt(h);
                if (hr === 0) return `12:${m} AM`;
                if (hr === 12) return `12:${m} PM`;
                return hr > 12 ? `${hr - 12}:${m} PM` : `${hr}:${m} AM`;
            };
            return `We're currently closed. Store opens at ${fmt(opensAt)}.`;
        }
        return "We're currently closed. Please try again during store hours.";
    }, [storeIsOpen, opensAt, closesAt]);

    // ── Menu data ────────────────────────────────
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState("all");

    const { data: menuData, isPending } = useGuestMenu({
        search: search || undefined,
    });
    const allProducts = menuData?.data?.menu ?? [];

    const categories = useMemo(() => {
        const seen = new Map();
        allProducts
            .filter((p) => p.category_name)
            .forEach((p) => seen.set(p.category_name, p.category_name));
        return [
            { id: "all", name: "All Items" },
            ...Array.from(seen.values()).map((name) => ({ id: name, name })),
        ];
    }, [allProducts]);

    const filtered =
        activeCategory === "all"
            ? allProducts
            : allProducts.filter((p) => p.category_name === activeCategory);

    // ── Cart state ───────────────────────────────
    const [cart, setCart] = useState([]); // [{ product_id, variant_id, product_name, size_name, quantity, unit_price }]

    const addToCart = useCallback((item) => {
        const qtyToAdd = item.quantity ?? 1;
        setCart((prev) => {
            const idx = prev.findIndex((i) => i.variant_id === item.variant_id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qtyToAdd };
                return updated;
            }
            return [...prev, { ...item, quantity: qtyToAdd }];
        });
        toast.success(`${qtyToAdd > 1 ? `${qtyToAdd}x ` : ""}${item.product_name} added to cart`, { duration: 1800 });
    }, []);

    const updateQty = useCallback((variantId, delta) => {
        setCart((prev) => {
            const idx = prev.findIndex((i) => i.variant_id === variantId);
            if (idx < 0) return prev;
            const newQty = prev[idx].quantity + delta;
            if (newQty <= 0) return prev.filter((_, i) => i !== idx);
            const updated = [...prev];
            updated[idx] = { ...updated[idx], quantity: newQty };
            return updated;
        });
    }, []);

    const removeItem = useCallback((variantId) => {
        setCart((prev) => prev.filter((i) => i.variant_id !== variantId));
    }, []);

    const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

    // ── Product detail modal ──────────────────────
    const [selectedProduct, setSelectedProduct] = useState(null);

    // ── Cart drawer modal ─────────────────────────
    const [showCartDrawer, setShowCartDrawer] = useState(false);

    // ── Checkout modal ────────────────────────────
    const [showCheckout, setShowCheckout] = useState(false);

    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    return (
        <div className="ord-root">
            {/* Header */}
            <header className="ord-header">
                <div className="ord-header-left">
                    <Link to="/" className="ord-header-brand" style={{ textDecoration: "none" }}>
                        <img 
                            src="/landing/logo_circle.png" 
                            alt="Abbey's Kitchenette" 
                            style={{ width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover", backgroundColor: "#fff", border: "1px solid #e5e7eb" }} 
                        />
                        <div>
                            <div className="ord-header-brand-name"><span className="ord-brand-cursive">Abbey's</span> Kitchenette</div>
                            <div className="ord-header-tagline">Online Ordering</div>
                        </div>
                    </Link>
                </div>

                <div className="ord-header-right">
                    <button
                        className="ord-header-cart-btn"
                        onClick={() => setShowCartDrawer(true)}
                        aria-label="View shopping cart"
                    >
                        <div className="ord-header-cart-icon-wrap">
                            <Icon name="cart" size={19} />
                            {cartCount > 0 && (
                                <span className="ord-header-cart-badge">{cartCount}</span>
                            )}
                        </div>
                        <span className="ord-header-cart-label">Cart</span>
                        {subtotal > 0 && (
                            <span className="ord-header-cart-subtotal">₱{subtotal.toLocaleString()}</span>
                        )}
                    </button>
                </div>
            </header>

            {/* Page hero strip */}
            <div className="ord-page-hero">
                <h1 className="ord-page-hero-title">Order Online</h1>
                <p className="ord-page-hero-sub">
                    Browse our menu, add items to your cart, and we'll have it ready for you.
                </p>
            </div>

            {/* Store closed banner */}
            {!storeIsOpen && (
                <div className="ord-closed-banner" style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "1rem 1.5rem",
                    margin: "0 1.5rem",
                    background: "linear-gradient(135deg, #fef3cd, #fde68a)",
                    border: "1.5px solid #f59e0b",
                    borderRadius: "0.75rem",
                    color: "#92400e",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                }}>
                    <Icon name="clock" size={20} style={{ color: "#d97706", flexShrink: 0 }} />
                    <span>{storeClosedMessage}</span>
                </div>
            )}

            {/* Main layout */}
            <div className="ord-layout">
                {/* Menu panel */}
                <div className="ord-menu-panel">
                    {/* Search */}
                    <div className="ord-search-bar">
                        <div className="ord-search-wrap">
                            <Icon name="search" className="ord-search-icon" size={18} />
                            <input
                                type="text"
                                className="ord-search-input"
                                placeholder="Search menu items..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    className="ord-search-clear"
                                    onClick={() => setSearch("")}
                                    aria-label="Clear search"
                                >
                                    <Icon name="x" size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category tabs */}
                    <div className="ord-category-tabs">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                className={`ord-category-tab${activeCategory === cat.id ? " active" : ""}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    {/* Product grid */}
                    {isPending ? (
                        <div className="ord-loading">
                            <Icon name="loader" size={28} className="animate-spin" />
                            <span>Loading menu...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="ord-empty">
                            <Icon name="search" size={32} style={{ opacity: 0.4 }} />
                            <p>No items found</p>
                        </div>
                    ) : (
                        <div className="ord-product-grid">
                            {filtered.map((product) => (
                                <ProductCard
                                    key={product.product_id}
                                    product={product}
                                    onOpenProductModal={setSelectedProduct}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Cart Drawer Modal */}
            {showCartDrawer && (
                <div className="ord-cart-drawer-overlay" onClick={() => setShowCartDrawer(false)}>
                    <div className="ord-cart-drawer-box" onClick={(e) => e.stopPropagation()}>
                        <div className="ord-modal-header" style={{ padding: "1.25rem 1.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                                <Icon name="cart" size={20} style={{ color: "var(--ord-amber-dark)" }} />
                                <span className="ord-modal-title">Your Order ({cartCount})</span>
                            </div>
                            <button
                                className="ord-modal-close"
                                onClick={() => setShowCartDrawer(false)}
                                aria-label="Close cart"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                            <CartPanel
                                cart={cart}
                                subtotal={subtotal}
                                onUpdateQty={updateQty}
                                onRemove={removeItem}
                                onCheckout={() => {
                                    setShowCartDrawer(false);
                                    setShowCheckout(true);
                                }}
                                storeIsOpen={storeIsOpen}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Product Detail Modal */}
            {selectedProduct && (
                <CustomerProductDetailModal
                    product={selectedProduct}
                    onAddToCart={addToCart}
                    onClose={() => setSelectedProduct(null)}
                />
            )}

            {/* Checkout Modal */}
            {showCheckout && (
                <CheckoutModal
                    cart={cart}
                    subtotal={subtotal}
                    onSuccess={onOrderSuccess}
                    onClose={() => setShowCheckout(false)}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   PRODUCT CARD
───────────────────────────────────────────────────────────── */
function ProductCard({ product, onOpenProductModal }) {
    const variants = product.variants ?? [];
    const availableVariants = variants.filter((v) => v.is_available !== false);
    const singleVariant = variants.length === 1 ? variants[0] : null;
    const isFullyUnavailable = variants.length > 0 && availableVariants.length === 0;

    return (
        <div
            className={`ord-product-card${isFullyUnavailable ? " unavailable" : ""}`}
            onClick={() => onOpenProductModal(product)}
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

/* ─────────────────────────────────────────────────────────────
   CART PANEL (shared by sidebar + drawer)
───────────────────────────────────────────────────────────── */
function CartPanel({ cart, subtotal, onUpdateQty, onRemove, onCheckout, storeIsOpen = true }) {
    return (
        <>
            <div className="ord-sidebar-body">
                {cart.length === 0 ? (
                    <div className="ord-cart-empty">
                        <div className="ord-cart-empty-icon">
                            <Icon name="cart" size={42} style={{ color: "#8c6e54", opacity: 0.65 }} />
                        </div>
                        <p style={{ margin: "0.5rem 0 0", fontWeight: 600, color: "#5c3d1e", fontSize: "0.9375rem" }}>
                            Your cart is empty
                        </p>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#8c6e54" }}>
                            Add items from the menu to get started.
                        </p>
                    </div>
                ) : (
                    cart.map((item) => (
                        <CartItemRow
                            key={item.variant_id}
                            item={item}
                            onUpdateQty={onUpdateQty}
                            onRemove={onRemove}
                        />
                    ))
                )}
            </div>

            <div className="ord-sidebar-footer">
                <div className="ord-totals">
                    <div className="ord-total-row">
                        <span>Subtotal</span>
                        <span>₱{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="ord-total-row" style={{ fontSize: "0.8125rem", color: "#b08d72" }}>
                        <span>Delivery / Dine-in</span>
                        <span>TBD</span>
                    </div>
                    <div className="ord-total-row grand">
                        <span>Total</span>
                        <span>₱{subtotal.toLocaleString()}</span>
                    </div>
                </div>
                <button
                    className="ord-checkout-btn"
                    onClick={onCheckout}
                    disabled={cart.length === 0 || !storeIsOpen}
                    title={!storeIsOpen ? "Store is currently closed" : ""}
                >
                    <Icon name="receipt" size={18} />
                    {!storeIsOpen ? "Store Closed" : "Place Order"}
                </button>
            </div>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────
   CART ITEM ROW
───────────────────────────────────────────────────────────── */
function CartItemRow({ item, onUpdateQty, onRemove }) {
    return (
        <div className="ord-cart-item">
            <div className="ord-cart-item-info">
                <div className="ord-cart-item-name">{item.product_name}</div>
                {item.size_name && (
                    <div className="ord-cart-item-size">{item.size_name}</div>
                )}
                <div className="ord-cart-item-price">
                    ₱{(item.unit_price * item.quantity).toLocaleString()}
                </div>
            </div>
            <div className="ord-qty-ctrl">
                <button
                    className="ord-qty-btn remove"
                    onClick={() =>
                        item.quantity === 1 ? onRemove(item.variant_id) : onUpdateQty(item.variant_id, -1)
                    }
                    aria-label="Decrease quantity"
                >
                    {item.quantity === 1 ? <Icon name="trash2" size={13} /> : "−"}
                </button>
                <span className="ord-qty-value">{item.quantity}</span>
                <button
                    className="ord-qty-btn"
                    onClick={() => onUpdateQty(item.variant_id, 1)}
                    aria-label="Increase quantity"
                >
                    +
                </button>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   CUSTOMER PRODUCT DETAIL MODAL (Picture 1 style)
───────────────────────────────────────────────────────────── */
function CustomerProductDetailModal({ product, onAddToCart, onClose }) {
    const variants = product.variants ?? [];
    const availableVariants = variants.filter((v) => v.is_available !== false);

    const [selectedVariantId, setSelectedVariantId] = useState(() => {
        return availableVariants.length > 0
            ? availableVariants[0].variant_id
            : variants[0]?.variant_id ?? null;
    });

    const [quantity, setQuantity] = useState(1);

    const selectedVariant = variants.find((v) => v.variant_id === selectedVariantId) || variants[0];
    const isAvailable = selectedVariant?.is_available !== false;
    const isFullyUnavailable = variants.length > 0 && availableVariants.length === 0;

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
        <div className="ord-detail-modal-overlay" onClick={onClose}>
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
                                    const vAvailable = v.is_available !== false;
                                    const isSelected = v.variant_id === selectedVariantId;
                                    return (
                                        <div
                                            key={v.variant_id}
                                            className={`ord-detail-variant-row ${isSelected ? "selected" : ""} ${!vAvailable ? "disabled" : ""}`}
                                            onClick={() => vAvailable && setSelectedVariantId(v.variant_id)}
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
                                        </div>
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
                            onClick={() => setQuantity((q) => q + 1)}
                            disabled={isFullyUnavailable || !isAvailable}
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
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   CHECKOUT MODAL
───────────────────────────────────────────────────────────── */
function CheckoutModal({ cart, subtotal, onClose, onSuccess }) {
    const [customerName, setCustomerName] = useState("");
    const [tableNumber, setTableNumber] = useState("");
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [errors, setErrors] = useState({});
    const { placeOrder } = useGuestOrderMutations();

    const validate = () => {
        const errs = {};
        if (!customerName.trim()) errs.name = "Name is required";
        if (!tableNumber.trim()) errs.table = "Table / reference is required";
        if (!privacyConsent) errs.consent = "You must agree to the Privacy Policy";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        try {
            const res = await placeOrder.mutateAsync({
                customer_name: customerName.trim(),
                table_number: tableNumber.trim(),
                items: cart.map((i) => ({
                    product_id: i.product_id,
                    variant_id: i.variant_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                })),
            });
            const createdOrder = res?.data?.order ?? {};
            onSuccess({
                orderId: createdOrder.order_id || null,
                orderNumber: createdOrder.order_number || null,
                guestToken: createdOrder.guest_token || null,
                customerName: customerName.trim(),
                tableNumber: tableNumber.trim(),
                totalAmount: createdOrder.total_amount ? Number(createdOrder.total_amount) : subtotal,
                items: cart.map((i) => ({
                    product_name: i.product_name,
                    size_name: i.size_name,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                })),
                createdAt: createdOrder.created_at || new Date().toISOString(),
            });
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to place order. Please try again.");
        }
    };

    return (
        <div className="ord-modal-overlay" onClick={onClose}>
            <div className="ord-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ord-modal-header">
                    <span className="ord-modal-title">Complete Your Order</span>
                    <button className="ord-modal-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="ord-modal-body">
                        {/* Customer name */}
                        <div className="ord-field">
                            <label className="ord-field-label">Your Name *</label>
                            <input
                                type="text"
                                className={`ord-field-input${errors.name ? " err" : ""}`}
                                placeholder="e.g. Juan dela Cruz"
                                value={customerName}
                                onChange={(e) => {
                                    setCustomerName(e.target.value);
                                    if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                                }}
                            />
                            {errors.name && <span className="ord-field-error">{errors.name}</span>}
                        </div>

                        {/* Table / reference */}
                        <div className="ord-field">
                            <label className="ord-field-label">Table / Reference *</label>
                            <input
                                type="text"
                                className={`ord-field-input${errors.table ? " err" : ""}`}
                                placeholder="e.g. Table 5 or Online-001"
                                value={tableNumber}
                                onChange={(e) => {
                                    setTableNumber(e.target.value);
                                    if (errors.table) setErrors((p) => ({ ...p, table: "" }));
                                }}
                            />
                            {errors.table && <span className="ord-field-error">{errors.table}</span>}
                        </div>

                        {/* Privacy consent */}
                        <div className="ord-field">
                            <label className="ord-checkbox-label">
                                <input
                                    type="checkbox"
                                    className="ord-checkbox"
                                    checked={privacyConsent}
                                    onChange={(e) => {
                                        setPrivacyConsent(e.target.checked);
                                        if (errors.consent) setErrors((p) => ({ ...p, consent: "" }));
                                    }}
                                />
                                <span className="ord-checkbox-text">
                                    I agree to the{" "}
                                    <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="ord-privacy-link">
                                        Privacy Policy
                                    </Link>{" "}
                                    and consent to the collection and processing of my personal data for order fulfillment.
                                </span>
                            </label>
                            {errors.consent && <span className="ord-field-error">{errors.consent}</span>}
                        </div>

                        {/* Order summary */}
                        <div>
                            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#5c3d1e", marginBottom: "0.5rem" }}>
                                Order Summary
                            </p>
                            <div className="ord-modal-order-summary">
                                {cart.map((item) => (
                                    <div key={item.variant_id} className="ord-modal-item-row">
                                        <span className="ord-modal-item-name">
                                            {item.product_name}
                                            {item.size_name ? ` (${item.size_name})` : ""} ×{item.quantity}
                                        </span>
                                        <span className="ord-modal-item-price">
                                            ₱{(item.unit_price * item.quantity).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="ord-modal-total">
                                <span>Total</span>
                                <span>₱{subtotal.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="ord-modal-footer">
                        <button
                            type="submit"
                            className="ord-submit-btn"
                            disabled={placeOrder.isPending}
                        >
                            {placeOrder.isPending ? (
                                <>
                                    <Icon name="loader" size={18} className="animate-spin" />
                                    Placing Order…
                                </>
                            ) : (
                                <>
                                    <Icon name="checkCircle" size={18} />
                                    Confirm Order
                                </>
                            )}
                        </button>
                        <button type="button" className="ord-cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   SUCCESS SCREEN (Redesigned Order Confirmation Page)
───────────────────────────────────────────────────────────── */
function SuccessScreen({ orderSuccess, onReset }) {
    const [linkCopied, setLinkCopied] = useState(false);
    const formattedDate = useMemo(() => {
        try {
            const date = orderSuccess?.createdAt ? new Date(orderSuccess.createdAt) : new Date();
            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            });
        } catch {
            return "Just now";
        }
    }, [orderSuccess?.createdAt]);

    const orderRef = useMemo(() => {
        if (orderSuccess?.orderNumber) {
            return orderNumberLabel(orderSuccess.orderNumber);
        }
        if (orderSuccess?.orderId) {
            return `#${orderSuccess.orderId.slice(-8).toUpperCase()}`;
        }
        return "#PENDING";
    }, [orderSuccess?.orderNumber, orderSuccess?.orderId]);

    // Short tracking ref from the guest token (first 8 chars).
    const trackRef = useMemo(() => {
        if (!orderSuccess?.guestToken) return null;
        return orderSuccess.guestToken.slice(0, 8).toUpperCase();
    }, [orderSuccess?.guestToken]);

    // Full tracking link (works on any device) + copy helper.
    const trackUrl = useMemo(() => {
        if (!orderSuccess?.guestToken) return null;
        try {
            return `${window.location.origin}/track/${orderSuccess.guestToken}`;
        } catch {
            return `/track/${orderSuccess.guestToken}`;
        }
    }, [orderSuccess?.guestToken]);

    async function handleCopyLink() {
        if (!trackUrl) return;
        try {
            await navigator.clipboard.writeText(trackUrl);
        } catch {
            // clipboard unavailable — selection fallback below still works
        }
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
    }

    return (
        <div className="ord-root ord-success-page">
            {/* Clean Header Bar */}
            <header className="ord-header">
                <div className="ord-header-left">
                    <Link to="/" className="ord-back-btn">
                        <Icon name="chevronLeft" size={16} />
                        Home
                    </Link>
                    <div className="ord-header-brand">
                        <img src="/favicon.png" alt="Abbey's Kitchenette" />
                        <div>
                            <div className="ord-header-brand-name">Abbey's Kitchenette</div>
                            <div className="ord-header-tagline">Order Confirmation</div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Center Content */}
            <main className="ord-success-container">
                <div className="ord-success-card">
                    {/* Header Banner */}
                    <div className="ord-success-banner">
                        <div className="ord-success-check-badge">
                            <Icon name="check" size={22} />
                        </div>
                        <h1 className="ord-success-main-title">Order Placed Successfully</h1>
                        <p className="ord-success-sub-text">
                            Thank you, <strong>{orderSuccess?.customerName || "Valued Customer"}</strong>! Your order has been submitted and is currently <strong>Pending</strong> approval. Please proceed to the counter for payment.
                        </p>
                    </div>

                    {/* Order Status Stepper — shared with tracking (always pending here) */}
                    <OrderStatusStepper status="pending" />

                    {/* Receipt Details Box */}
                    <div className="ord-receipt-box">
                        <div className="ord-receipt-top">
                            <div className="ord-receipt-ref-group">
                                <span className="ord-receipt-ref-label">Order Reference</span>
                                <span className="ord-receipt-ref-value">{orderRef}</span>
                            </div>
                            <div className="ord-status-tag pending">
                                <span className="ord-status-pulse" />
                                Pending Approval
                            </div>
                        </div>

                        {/* Customer & Order Metadata */}
                        <div className="ord-receipt-grid">
                            <div className="ord-grid-cell">
                                <span className="ord-cell-label">Customer Name</span>
                                <span className="ord-cell-value">{orderSuccess?.customerName || "—"}</span>
                            </div>
                            <div className="ord-grid-cell">
                                <span className="ord-cell-label">Table</span>
                                <span className="ord-cell-value">{orderSuccess?.tableNumber || "—"}</span>
                            </div>
                            <div className="ord-grid-cell">
                                <span className="ord-cell-label">Date & Time</span>
                                <span className="ord-cell-value">{formattedDate}</span>
                            </div>
                        </div>

                        {/* Items List */}
                        {orderSuccess?.items?.length > 0 && (
                            <div className="ord-receipt-items-section">
                                <span className="ord-items-section-title">Order Items</span>
                                <div className="ord-receipt-items-table">
                                    {orderSuccess.items.map((item, idx) => (
                                        <div key={idx} className="ord-receipt-item-line">
                                            <div className="ord-item-line-left">
                                                <span className="ord-item-qty-tag">{item.quantity}×</span>
                                                <div className="ord-item-name-group">
                                                    <span className="ord-item-name">{item.product_name || item.name}</span>
                                                    {item.size_name && (
                                                        <span className="ord-item-size">({item.size_name})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="ord-item-line-price">
                                                ₱{((item.unit_price || item.unitPrice || 0) * item.quantity).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Total Block */}
                        <div className="ord-receipt-total-bar">
                            <span className="ord-total-label">Total Amount</span>
                            <span className="ord-total-val">
                                ₱{Number(orderSuccess?.totalAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Tracking ID — save this link */}
                    {trackUrl && (
                        <>
                            <div className="ord-track-ref-head">
                                <span className="ord-items-section-title">Tracking ID is {trackRef}</span>
                                <span className="ord-track-ref-sub">Please SAVE this tracking link — you&apos;ll need it to follow your order.</span>
                            </div>
                            <div className="ord-track-link-row">
                                <Icon name="send" size={14} className="ord-callout-icon" />
                                <a href={trackUrl} target="_blank" rel="noreferrer" className="ord-track-link">
                                    {trackUrl}
                                </a>
                                <button type="button" onClick={handleCopyLink} className="ord-track-copy" title="Copy tracking link">
                                    <Icon name={linkCopied ? "check" : "copy"} size={14} />
                                    {linkCopied ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Primary & Secondary Actions — full-width stack */}
                    <div className="ord-action-stack">
                        {orderSuccess?.guestToken ? (
                            <Link to={`/track/${orderSuccess.guestToken}`} className="ord-primary-btn ord-full">
                                <Icon name="search" size={16} />
                                Track Order
                            </Link>
                        ) : (
                            <button className="ord-primary-btn ord-full" onClick={onReset}>
                                <Icon name="plus" size={16} />
                                Order Again
                            </button>
                        )}
                        <button className="ord-secondary-btn ord-full" onClick={onReset}>
                            <Icon name="plus" size={16} />
                            New Order
                        </button>
                        <Link to="/" className="ord-quiet-btn">
                            <Icon name="chevronLeft" size={16} />
                            Back to Home
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
