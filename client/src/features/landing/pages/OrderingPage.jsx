import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import "../ordering.css";
import { useGuestMenu, useGuestOrderMutations } from "@/features/orders/query";
import Icon from "@/components/ui/icon";

/**
 * OrderingPage
 * Public-facing online ordering page for Abbey's Kitchenette.
 *
 * Features:
 *  • Product grid with category filter + search (reuses GET /api/guest/menu)
 *  • Sticky cart sidebar (desktop) + bottom drawer (mobile)
 *  • Variant selector modal for multi-size products
 *  • Checkout modal with customer info fields
 *  • Order success confirmation screen
 *  • Uses useGuestMenu + useGuestOrderMutations from orders/query.js
 */
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
        setCart((prev) => {
            const idx = prev.findIndex((i) => i.variant_id === item.variant_id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
                return updated;
            }
            return [...prev, item];
        });
        toast.success(`${item.product_name} added to cart`, { duration: 1800 });
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

    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
    const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

    // ── Variant modal ─────────────────────────────
    const [variantProduct, setVariantProduct] = useState(null);

    // ── Checkout modal ────────────────────────────
    const [showCheckout, setShowCheckout] = useState(false);

    // ── Mobile drawer ─────────────────────────────
    const [showDrawer, setShowDrawer] = useState(false);

    return (
        <div className="ord-root">
            {/* Header */}
            <header className="ord-header">
                <div className="ord-header-left">
                    <Link to="/" className="ord-header-brand" style={{ textDecoration: "none" }}>
                        <img src="/favicon.png" alt="Abbey's Kitchenette" />
                        <div>
                            <div className="ord-header-brand-name">Abbey's Kitchenette</div>
                            <div className="ord-header-tagline">Online Ordering</div>
                        </div>
                    </Link>
                </div>

                {/* Mobile cart button */}
                <button
                    className="ord-cart-header-btn"
                    onClick={() => setShowDrawer(true)}
                    aria-label="Open cart"
                    style={{ display: "flex" }}
                >
                    <Icon name="shoppingBag" size={17} />
                    <span className="hidden sm:inline">Cart</span>
                    {cartCount > 0 && (
                        <span className="ord-cart-badge">{cartCount}</span>
                    )}
                </button>
            </header>

            {/* Page hero strip */}
            <div className="ord-page-hero">
                <h1 className="ord-page-hero-title">Order Online</h1>
                <p className="ord-page-hero-sub">
                    Browse our menu, add items to your cart, and we'll have it ready for you.
                </p>
            </div>

            {/* Main layout */}
            <div className="ord-layout">
                {/* Left: Menu panel */}
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
                                    cart={cart}
                                    onAddToCart={addToCart}
                                    onOpenVariantModal={setVariantProduct}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right: Cart sidebar (desktop) */}
                <aside className="ord-sidebar-desktop">
                    <CartPanel
                        cart={cart}
                        subtotal={subtotal}
                        onUpdateQty={updateQty}
                        onRemove={removeItem}
                        onCheckout={() => setShowCheckout(true)}
                    />
                </aside>
            </div>

            {/* Mobile Bottom Bar */}
            {cartCount > 0 && (
                <div className="ord-mobile-bar">
                    <button
                        className="ord-mobile-bar-btn"
                        onClick={() => setShowDrawer(true)}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span className="ord-cart-badge">{cartCount}</span>
                            <span>View Order</span>
                        </div>
                        <span>₱{subtotal.toLocaleString()}</span>
                    </button>
                </div>
            )}

            {/* Mobile Cart Drawer */}
            {showDrawer && (
                <div className="ord-drawer-overlay" onClick={() => setShowDrawer(false)}>
                    <div
                        className="ord-drawer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="ord-drawer-handle" />
                        <CartPanel
                            cart={cart}
                            subtotal={subtotal}
                            onUpdateQty={updateQty}
                            onRemove={removeItem}
                            onCheckout={() => {
                                setShowDrawer(false);
                                setShowCheckout(true);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Variant Selector Modal */}
            {variantProduct && (
                <VariantModal
                    product={variantProduct}
                    onSelect={(item) => {
                        addToCart(item);
                        setVariantProduct(null);
                    }}
                    onClose={() => setVariantProduct(null)}
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
function ProductCard({ product, cart, onAddToCart, onOpenVariantModal }) {
    const variants = product.variants ?? [];
    const availableVariants = variants.filter((v) => v.is_available !== false);
    const singleVariant = variants.length === 1 ? variants[0] : null;
    const isFullyUnavailable = variants.length > 0 && availableVariants.length === 0;

    const handleAdd = () => {
        if (variants.length === 1 && singleVariant) {
            onAddToCart({
                product_id: product.product_id,
                variant_id: singleVariant.variant_id,
                product_name: product.product_name,
                size_name: singleVariant.size_name !== "Default" ? singleVariant.size_name : null,
                quantity: 1,
                unit_price: Number(singleVariant.price),
            });
        } else if (variants.length > 1) {
            onOpenVariantModal(product);
        }
    };

    return (
        <div className={`ord-product-card${isFullyUnavailable ? " unavailable" : ""}`}>
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
                    onClick={handleAdd}
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
function CartPanel({ cart, subtotal, onUpdateQty, onRemove, onCheckout }) {
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    return (
        <>
            <div className="ord-sidebar-header">
                <span className="ord-sidebar-title">Your Order</span>
                <span className="ord-sidebar-count">
                    {cartCount} item{cartCount !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="ord-sidebar-body">
                {cart.length === 0 ? (
                    <div className="ord-cart-empty">
                        <div className="ord-cart-empty-icon">🛒</div>
                        <p style={{ margin: 0, fontWeight: 600, color: "#5c3d1e" }}>
                            Your cart is empty
                        </p>
                        <p style={{ margin: 0, fontSize: "0.8125rem" }}>
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
                    disabled={cart.length === 0}
                >
                    <Icon name="receipt" size={18} />
                    Place Order
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
   VARIANT SELECTOR MODAL
───────────────────────────────────────────────────────────── */
function VariantModal({ product, onSelect, onClose }) {
    const variants = product.variants ?? [];

    return (
        <div className="ord-modal-overlay" onClick={onClose}>
            <div
                className="ord-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 400 }}
            >
                <div className="ord-modal-header">
                    <span className="ord-modal-title">{product.product_name}</span>
                    <button className="ord-modal-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>
                <div className="ord-modal-body" style={{ paddingTop: "0.75rem" }}>
                    <p style={{ fontSize: "0.8125rem", color: "#7c5c3e", margin: 0 }}>
                        Choose your size:
                    </p>
                    <div className="ord-variant-list">
                        {variants.map((v) => {
                            const available = v.is_available !== false;
                            return (
                                <button
                                    key={v.variant_id}
                                    className="ord-variant-btn"
                                    disabled={!available}
                                    onClick={() =>
                                        available &&
                                        onSelect({
                                            product_id: product.product_id,
                                            variant_id: v.variant_id,
                                            product_name: product.product_name,
                                            size_name: v.size_name,
                                            quantity: 1,
                                            unit_price: Number(v.price),
                                        })
                                    }
                                >
                                    <div style={{ textAlign: "left" }}>
                                        <div className="ord-variant-name">{v.size_name}</div>
                                        {!available && (
                                            <div className="ord-variant-oos">Out of stock</div>
                                        )}
                                    </div>
                                    <div className="ord-variant-price">
                                        ₱{Number(v.price).toLocaleString()}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   MOBILE CART DRAWER
───────────────────────────────────────────────────────────── */
function MobileDrawer({ cart, subtotal, onUpdateQty, onRemove, onClose, onCheckout }) {
    return (
        <>
            <div className="ord-drawer-overlay" onClick={onClose} />
            <div className="ord-drawer">
                <div className="ord-drawer-handle" />
                <div className="ord-drawer-header">
                    <span className="ord-drawer-title">Your Order</span>
                    <button className="ord-drawer-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>
                <div className="ord-drawer-body">
                    {cart.length === 0 ? (
                        <div className="ord-cart-empty">
                            <div className="ord-cart-empty-icon">🛒</div>
                            <p style={{ margin: 0, fontWeight: 600, color: "#5c3d1e" }}>
                                Your cart is empty
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
                <div className="ord-drawer-footer">
                    <div className="ord-totals">
                        <div className="ord-total-row grand">
                            <span>Total</span>
                            <span>₱{subtotal.toLocaleString()}</span>
                        </div>
                    </div>
                    <button
                        className="ord-checkout-btn"
                        onClick={onCheckout}
                        disabled={cart.length === 0}
                    >
                        <Icon name="receipt" size={18} />
                        Place Order
                    </button>
                </div>
            </div>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────
   CHECKOUT MODAL
───────────────────────────────────────────────────────────── */
function CheckoutModal({ cart, subtotal, onClose, onSuccess }) {
    const [customerName, setCustomerName] = useState("");
    const [tableNumber, setTableNumber] = useState("");
    const [errors, setErrors] = useState({});
    const { placeOrder } = useGuestOrderMutations();

    const validate = () => {
        const errs = {};
        if (!customerName.trim()) errs.name = "Name is required";
        if (!tableNumber.trim()) errs.table = "Table / reference is required";
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
            return `#${String(orderSuccess.orderNumber).padStart(4, "0")}`;
        }
        if (orderSuccess?.orderId) {
            return `#${orderSuccess.orderId.slice(-8).toUpperCase()}`;
        }
        return "#PENDING";
    }, [orderSuccess?.orderNumber, orderSuccess?.orderId]);

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
                            Thank you, <strong>{orderSuccess?.customerName || "Valued Customer"}</strong>! Your order has been submitted and is currently <strong>Pending</strong> approval.
                        </p>
                    </div>

                    {/* Order Status Stepper */}
                    <div className="ord-status-stepper">
                        <div className="ord-step-item step-completed">
                            <div className="ord-step-circle">
                                <Icon name="check" size={14} />
                            </div>
                            <div className="ord-step-text">
                                <span className="ord-step-title">Order Placed</span>
                                <span className="ord-step-desc">Pending</span>
                            </div>
                        </div>
                        <div className="ord-step-line" />
                        <div className="ord-step-item step-upcoming">
                            <div className="ord-step-circle">2</div>
                            <div className="ord-step-text">
                                <span className="ord-step-title">Kitchen Prep</span>
                                <span className="ord-step-desc">In Queue</span>
                            </div>
                        </div>
                        <div className="ord-step-line" />
                        <div className="ord-step-item step-upcoming">
                            <div className="ord-step-circle">3</div>
                            <div className="ord-step-text">
                                <span className="ord-step-title">Ready / Served</span>
                                <span className="ord-step-desc">Counter</span>
                            </div>
                        </div>
                    </div>

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
                                <span className="ord-cell-label">Table / Ref</span>
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

                    {/* Notice Tip */}
                    <div className="ord-info-callout">
                        <Icon name="info" size={16} className="ord-callout-icon" />
                        <span>
                            Please present your <strong>Table / Ref ({orderSuccess?.tableNumber})</strong> at the counter when completing payment.
                        </span>
                    </div>

                    {/* Primary & Secondary Actions */}
                    <div className="ord-action-row">
                        <button className="ord-primary-btn" onClick={onReset}>
                            <Icon name="plus" size={16} />
                            Order Again
                        </button>
                        <Link to="/" className="ord-secondary-btn">
                            <Icon name="chevronLeft" size={16} />
                            Back to Home
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
