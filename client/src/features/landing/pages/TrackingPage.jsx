import { Link, useParams } from "react-router-dom";
import "../ordering.css";
import { useGuestOrder } from "@/features/orders/query";
import { orderNumberLabel } from "@/lib/orderNumber";
import OrderStatusStepper from "../components/OrderStatusStepper";
import Icon from "@/components/ui/icon";

/**
 * TrackingPage (BR-04)
 *
 * Public live order tracking at /track/:token (full token only).
 * Polls every 15s (same cadence as the POS feed). Read-only by
 * design — changes and cancels happen at the counter.
 */

export default function TrackingPage() {
    const { token } = useParams();
    const { data, isLoading, isError, isFetching } = useGuestOrder(token);
    const order = data?.data?.order ?? null;

    const status = order?.status ?? null;

    return (
        <div className="ord-root ord-success-page">
            <header className="ord-header">
                <div className="ord-header-left">
                    <Link to="/order" className="ord-back-btn">
                        <Icon name="chevronLeft" size={16} />
                        Order
                    </Link>
                    <div className="ord-header-brand">
                        <img src="/favicon.png" alt="Abbey's Kitchenette" />
                        <div>
                            <div className="ord-header-brand-name">Abbey's Kitchenette</div>
                            <div className="ord-header-tagline">Order Tracking</div>
                        </div>
                    </div>
                </div>
                {!isLoading && !isError && order && (
                    <div className="ord-live-pill" title="Auto-refreshes every 15 seconds">
                        <span className={`ord-status-pulse${isFetching ? "" : " paused"}`} />
                        Live
                    </div>
                )}
            </header>

            <main className="ord-success-container">
                <div className="ord-success-card">
                    {isLoading ? (
                        <div className="ord-loading-box">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            <p>Finding your order…</p>
                        </div>
                    ) : isError || !order ? (
                        <div className="ord-empty-box">
                            <Icon name="search" size={28} />
                            <h1 className="ord-success-main-title">Order not found</h1>
                            <p className="ord-success-sub-text">
                                This tracking link looks invalid or expired. Please open
                                your saved tracking link, or place a new order at the counter.
                            </p>
                            <div className="ord-action-row">
                                <Link to="/order" className="ord-primary-btn">
                                    <Icon name="plus" size={16} />
                                    New Order
                                </Link>
                                <Link to="/" className="ord-secondary-btn">
                                    <Icon name="chevronLeft" size={16} />
                                    Back to Home
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="ord-success-banner">
                                <h1 className="ord-success-main-title">
                                    Order {orderNumberLabel(order.order_number)}
                                </h1>
                            </div>

                            {status === "cancelled" ? (
                                <div className="ord-cancelled-box">
                                    <Icon name="x" size={22} />
                                    <h1 className="ord-success-main-title">Order Cancelled</h1>
                                    <p className="ord-success-sub-text">
                                        This order was cancelled. Please approach the counter
                                        if you need help or a refund.
                                    </p>
                                </div>
                            ) : (
                                <OrderStatusStepper status={status} />
                            )}

                            <div className="ord-track-who">
                                <div className="ord-track-who-item">
                                    <span className="ord-track-who-icon">
                                        <Icon name="user" size={15} />
                                    </span>
                                    <span className="ord-track-who-text">
                                        <span className="ord-track-who-label">Customer</span>
                                        <strong className="ord-track-who-value">{order.customer_name || "Guest"}</strong>
                                    </span>
                                </div>
                                <div className="ord-track-who-item">
                                    <span className="ord-track-who-icon">
                                        <Icon name="table" size={15} />
                                    </span>
                                    <span className="ord-track-who-text">
                                        <span className="ord-track-who-label">Table</span>
                                        <strong className="ord-track-who-value">{order.table_number || "—"}</strong>
                                    </span>
                                </div>
                            </div>

                            <div className="ord-receipt-box">
                                <div className="ord-receipt-top">
                                    <div className="ord-receipt-ref-group">
                                        <span className="ord-receipt-ref-label">Total Amount</span>
                                        <span className="ord-receipt-ref-value">
                                            ₱{Number(order.total_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className={`ord-status-tag ${status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "pending"}`}>
                                        <span className="ord-status-pulse" />
                                        {status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown"}
                                    </div>
                                </div>

                                {order.items?.length > 0 && (
                                    <div className="ord-receipt-items-section">
                                        <span className="ord-items-section-title">
                                            Order Items
                                            {(() => {
                                                const done = order.items.filter((i) => i.is_prepared).length;
                                                const total = order.items.length;
                                                if (order.status === "preparing" && done < total) {
                                                    return ` — ${done} of ${total} served`;
                                                }
                                                return "";
                                            })()}
                                        </span>
                                        <div className="ord-receipt-items-table">
                                            {order.items.map((item, idx) => {
                                                const done = !!item.is_prepared;
                                                const cooking = !done && (order.status === "accepted" || order.status === "preparing");
                                                return (
                                                    <div key={idx} className={`ord-receipt-item-line${done ? " item-done" : ""}`}>
                                                        <div className="ord-item-line-left">
                                                            <span className={`ord-item-check${done ? " done" : cooking ? " cooking" : ""}`}>
                                                                {done ? (
                                                                    <Icon name="check" size={12} />
                                                                ) : (
                                                                    <span className="ord-item-dot" />
                                                                )}
                                                            </span>
                                                            <span className="ord-item-qty-tag">{item.quantity}×</span>
                                                            <div className="ord-item-name-group">
                                                                <span className="ord-item-name">{item.product_name}</span>
                                                                {item.size_name && (
                                                                    <span className="ord-item-size">({item.size_name})</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="ord-item-line-price">
                                                            ₱{Number(item.subtotal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="ord-action-row">
                                <Link to="/order" className="ord-secondary-btn">
                                    <Icon name="plus" size={16} />
                                    New Order
                                </Link>
                                <Link to="/" className="ord-secondary-btn">
                                    <Icon name="chevronLeft" size={16} />
                                    Back to Home
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
