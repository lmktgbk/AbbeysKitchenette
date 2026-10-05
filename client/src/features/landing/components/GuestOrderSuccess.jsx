import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import OrderStatusStepper from "./OrderStatusStepper";
import { orderNumberLabel } from "@/lib/orderNumber";

/** Displays the confirmed submission and its private tracking link; it does not submit or modify orders. */
export default function SuccessScreen({ orderSuccess, onReset }) {
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
    }, [orderSuccess]);

    const orderRef = useMemo(() => {
        if (orderSuccess?.orderNumber) {
            return orderNumberLabel(orderSuccess.orderNumber);
        }
        if (orderSuccess?.orderId) {
            return `#${orderSuccess.orderId.slice(-8).toUpperCase()}`;
        }
        return "#PENDING";
    }, [orderSuccess]);

    // Short tracking ref from the guest token (first 8 chars).
    const trackRef = useMemo(() => {
        if (!orderSuccess?.guestToken) return null;
        return orderSuccess.guestToken.slice(0, 8).toUpperCase();
    }, [orderSuccess]);

    // Full tracking link (works on any device) + copy helper.
    const trackUrl = useMemo(() => {
        if (!orderSuccess?.guestToken) return null;
        try {
            return `${window.location.origin}/track/${orderSuccess.guestToken}`;
        } catch {
            return `/track/${orderSuccess.guestToken}`;
        }
    }, [orderSuccess]);

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
