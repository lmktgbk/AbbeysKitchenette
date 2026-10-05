/**
 * Guest ordering keeps recoverable cart intent separate from current menu quotes.
 * Store hours and menu preflight guide the UI; the server authorizes and prices each submission.
 */
import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import "../ordering.css";
import { useGuestMenu } from "@/features/orders/query";
import { useStoreSettings } from "@/features/landing/query";
import Icon from "@/components/ui/icon";
import GuestDialog from "../components/GuestDialog";
import useGuestCart from "../useGuestCart";
import { MAX_LINES, MAX_QUANTITY, reconcileCart, writeCart } from "../cart";
import { manilaParts } from "@/lib/date";
import ProductCard from "../components/GuestProductCard";
import CartPanel from "../components/GuestCartPanel";
import CustomerProductDetailModal from "../components/GuestProductDetailModal";
import CheckoutModal from "../components/GuestCheckoutModal";
import SuccessScreen from "../components/GuestOrderSuccess";

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

/** Switches from cart composition to confirmation after a successful submission. */
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
/** Owns recoverable cart intent, reconciles menu quotes, and coordinates the guest dialogs. */
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

    // One complete catalog supports both local search and authoritative cart reconciliation.
    const menuQuery = useGuestMenu({}, { refetchInterval: 60000 });
    const { data: menuData, isPending, isError, isFetching, refetch } = menuQuery;
    const allProducts = useMemo(() => menuData?.data?.menu ?? [], [menuData]);

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

    const filtered = allProducts.filter(product =>
        (activeCategory === "all" || product.category_name === activeCategory) &&
        product.product_name.toLowerCase().includes(search.trim().toLowerCase()));

    // ── Cart state ───────────────────────────────
    const [intent, setIntent] = useGuestCart();
    const cart = useMemo(() => reconcileCart(intent, allProducts), [intent, allProducts]);
    const checkoutAvailable = !isPending && !isError && cart.length > 0 && cart.every(item => item.available);

    const addToCart = useCallback((item) => {
        if (isError) { toast.error("Retry the menu before adding items."); return; }
        const existing = intent.find(line => line.variant_id === item.variant_id);
        const qtyToAdd = Math.min(item.quantity ?? 1, MAX_QUANTITY - (existing?.quantity ?? 0));
        if (qtyToAdd <= 0 || (!existing && intent.length >= MAX_LINES)) {
            toast.error("This cart has reached the order limit."); return;
        }
        setIntent((prev) => {
            const idx = prev.findIndex((i) => i.variant_id === item.variant_id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], quantity: Math.min(MAX_QUANTITY, updated[idx].quantity + qtyToAdd) };
                return updated;
            }
            if (prev.length >= MAX_LINES) return prev;
            return [...prev, { product_id: item.product_id, variant_id: item.variant_id, quantity: Math.min(MAX_QUANTITY, qtyToAdd) }];
        });
        toast.success(`${qtyToAdd > 1 ? `${qtyToAdd}x ` : ""}${item.product_name} added to cart`, { duration: 1800 });
    }, [intent, isError, setIntent]);

    const updateQty = useCallback((variantId, delta) => {
        setIntent((prev) => {
            const idx = prev.findIndex((i) => i.variant_id === variantId);
            if (idx < 0) return prev;
            const newQty = prev[idx].quantity + delta;
            if (newQty <= 0) return prev.filter((_, i) => i !== idx);
            const updated = [...prev];
            updated[idx] = { ...updated[idx], quantity: Math.min(MAX_QUANTITY, newQty) };
            return updated;
        });
    }, [setIntent]);

    const removeItem = useCallback((variantId) => {
        setIntent((prev) => prev.filter((i) => i.variant_id !== variantId));
    }, [setIntent]);

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
                    margin: "1.5rem 1.5rem 0",
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
                    ) : isError ? (
                        <div className="ord-empty" role="alert">
                            <p>We couldn’t refresh the menu. Please try again before ordering.</p>
                            <button className="ord-cancel-btn" disabled={isFetching} onClick={() => refetch()}>
                                {isFetching ? "Retrying…" : "Retry menu"}
                            </button>
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
                <GuestDialog className="ord-cart-drawer-overlay" label="Your shopping cart" onClose={() => setShowCartDrawer(false)}>
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
                                checkoutAvailable={checkoutAvailable}
                            />
                        </div>
                    </div>
                </GuestDialog>
            )}

            {/* Product Detail Modal */}
            {selectedProduct && (
                <CustomerProductDetailModal
                    product={allProducts.find(product => product.product_id === selectedProduct.product_id) ?? { ...selectedProduct, is_available: false }}
                    onAddToCart={addToCart}
                    onClose={() => setSelectedProduct(null)}
                />
            )}

            {/* Checkout Modal */}
            {showCheckout && (
                <CheckoutModal
                    cart={cart}
                    subtotal={subtotal}
                    menuQuery={menuQuery}
                    onSuccess={result => {
                        // Clear synchronously before unmounting; an effect cannot run on the removed ordering screen.
                        try { writeCart(window.sessionStorage, []); } catch { /* Storage may be disabled. */ }
                        setIntent([]);
                        onOrderSuccess(result);
                    }}
                    onClose={() => setShowCheckout(false)}
                />
            )}
        </div>
    );
}
