import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import GuestDialog from "./GuestDialog";
import { useGuestOrderMutations } from "@/features/orders/query";
import { useDiningTableOptions } from "@/features/landing/query";
import { reconcileCart, sameCartQuote } from "../cart";

/** Rechecks the menu before submission and preserves the original payload when an uncertain result must be retried. */
export default function CheckoutModal({ cart, subtotal, onClose, onSuccess, menuQuery }) {
    const [customerName, setCustomerName] = useState("");
    const [tableNumber, setTableNumber] = useState("");
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [errors, setErrors] = useState({});
    const { placeOrder } = useGuestOrderMutations();
    const tableOptions = useDiningTableOptions();
    const [checking, setChecking] = useState(false);
    const [submissionError, setSubmissionError] = useState("");
    const [uncertain, setUncertain] = useState(false);
    // A synchronous gate blocks a second submit before React renders the pending state.
    const admission = useRef(false);
    const [retrySnapshot, setRetrySnapshot] = useState(null);
    const displayedCart = retrySnapshot?.items ?? cart;
    const displayedTotal = retrySnapshot ? displayedCart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) : subtotal;
    const busy = checking || placeOrder.isPending;

    // Validate customer fields locally; the API remains responsible for order authorization and pricing.
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
        if (admission.current || !validate()) return;
        admission.current = true;
        setChecking(true);
        setSubmissionError("");
        try {
            let quoted = cart;
            // Only a new submission is requoted. Recovery must use the already-submitted details.
            if (!retrySnapshot) {
                const fresh = await menuQuery.refetch();
                if (fresh.isError || !Array.isArray(fresh.data?.data?.menu)) throw Error("We couldn’t verify the menu. Please retry.");
                quoted = reconcileCart(cart, fresh.data.data.menu);
                if (!quoted.length || quoted.some(item => !item.available)) throw Error("Some items are unavailable. Return to your cart and remove them.");
                if (!sameCartQuote(cart, quoted)) throw Error("Menu prices have changed. Review the updated total, then confirm again.");
            }
            const payload = retrySnapshot?.payload ?? {
                customer_name: customerName.trim(),
                table_number: tableNumber.trim(),
                items: quoted.map((i) => ({
                    product_id: i.product_id,
                    variant_id: i.variant_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                })),
            };
            // An uncertain response must replay the original payload, even if the live menu changes.
            const snapshot = retrySnapshot ?? { payload, items: quoted };
            let res;
            try {
                res = await placeOrder.mutateAsync(payload);
            } catch (error) {
                const status = error.response?.status;
                // These failures cannot prove whether the server committed; retain the payload for recovery.
                const uncertainResult = !status || status >= 500 || status === 408 || ["SUBMISSION_PENDING", "IDEMPOTENCY_CONFLICT"].includes(error.response?.data?.error);
                setRetrySnapshot(uncertainResult ? snapshot : null);
                setUncertain(uncertainResult);
                throw error;
            }
            const createdOrder = res?.data?.order ?? {};
            onSuccess({
                orderId: createdOrder.order_id || null,
                orderNumber: createdOrder.order_number || null,
                guestToken: createdOrder.guest_token || null,
                customerName: payload.customer_name,
                tableNumber: payload.table_number,
                totalAmount: createdOrder.total_amount ? Number(createdOrder.total_amount) : subtotal,
                items: snapshot.items.map((i) => ({
                    product_name: i.product_name,
                    size_name: i.size_name,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                })),
                createdAt: createdOrder.created_at || new Date().toISOString(),
            });
        } catch (err) {
            setSubmissionError(err.response?.data?.message || err.message || "Failed to place order. Please try again.");
        } finally {
            admission.current = false;
            setChecking(false);
        }
    };

    return (
        <GuestDialog className="ord-modal-overlay" label="Complete your order" onClose={onClose} busy={busy}>
            <div className="ord-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ord-modal-header">
                    <span className="ord-modal-title">Complete Your Order</span>
                    <button className="ord-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
                        <Icon name="x" size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="ord-modal-body">
                        {/* Customer name */}
                        <div className="ord-field">
                            <label className="ord-field-label" htmlFor="guest-name">Your Name *</label>
                            <input
                                type="text"
                                id="guest-name"
                                maxLength={100}
                                readOnly={busy || uncertain}
                                aria-invalid={Boolean(errors.name)}
                                aria-describedby={errors.name ? "guest-name-error" : undefined}
                                className={`ord-field-input${errors.name ? " err" : ""}`}
                                placeholder="e.g. Juan dela Cruz"
                                value={customerName}
                                onChange={(e) => {
                                    setCustomerName(e.target.value);
                                    if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                                }}
                            />
                            {errors.name && <span id="guest-name-error" className="ord-field-error" role="alert">{errors.name}</span>}
                        </div>

                        {/* Table / reference */}
                        <div className="ord-field">
                            <label className="ord-field-label" htmlFor="guest-table">Table / Reference *</label>
                            <select id="guest-table" className="ord-field-input"
                                value={tableNumber}
                                disabled={busy || uncertain}
                                aria-invalid={Boolean(errors.table)}
                                aria-describedby={errors.table ? "guest-table-error" : undefined}
                                onChange={event => {
                                    setTableNumber(event.target.value);
                                    if (errors.table) setErrors((p) => ({ ...p, table: "" }));
                                }}
                            >
                                <option value="">Select table or Takeout</option>
                                {tableOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            {errors.table && <span id="guest-table-error" className="ord-field-error" role="alert">{errors.table}</span>}
                        </div>

                        {/* Privacy consent */}
                        <div className="ord-field">
                            <label className="ord-checkbox-label">
                                <input
                                    type="checkbox"
                                    className="ord-checkbox"
                                    checked={privacyConsent}
                                    disabled={busy || uncertain}
                                    aria-invalid={Boolean(errors.consent)}
                                    aria-describedby={errors.consent ? "guest-consent-error" : undefined}
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
                            {errors.consent && <span id="guest-consent-error" className="ord-field-error" role="alert">{errors.consent}</span>}
                        </div>

                        {/* Order summary */}
                        <div>
                            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#5c3d1e", marginBottom: "0.5rem" }}>
                                Order Summary
                            </p>
                            <div className="ord-modal-order-summary">
                                {displayedCart.map((item) => (
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
                                <span>₱{displayedTotal.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="ord-modal-footer">
                        {submissionError && <p role="alert">{submissionError}</p>}
                        {uncertain && <p role="status">Your order may already be saved. Retry this same order to recover its confirmation. Verify it with staff before starting another.</p>}
                        <button
                            type="submit"
                            className="ord-submit-btn"
                            disabled={busy}
                        >
                            {busy ? (
                                <>
                                    <Icon name="loader" size={18} className="animate-spin" />
                                    Placing Order…
                                </>
                            ) : (
                                <>
                                    <Icon name="checkCircle" size={18} />
                                    {uncertain ? "Retry same order" : "Confirm Order"}
                                </>
                            )}
                        </button>
                        <button type="button" className="ord-cancel-btn" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </GuestDialog>
    );
}
