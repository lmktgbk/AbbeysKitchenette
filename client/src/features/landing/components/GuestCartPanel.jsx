import Icon from "@/components/ui/icon";
import { MAX_QUANTITY } from "../cart";

/** Displays the current menu quote and delegates quantity changes and checkout to the cart owner. */
export default function CartPanel({ cart, subtotal, onUpdateQty, onRemove, onCheckout, storeIsOpen = true, checkoutAvailable }) {
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
                    disabled={!checkoutAvailable || !storeIsOpen}
                    title={!storeIsOpen ? "Store is currently closed" : ""}
                >
                    <Icon name="receipt" size={18} />
                    {!storeIsOpen ? "Store Closed" : "Place Order"}
                </button>
                {cart.length > 0 && !checkoutAvailable && <p role="status">Review unavailable items or retry the menu before checkout.</p>}
            </div>
        </>
    );
}

/** Keeps line controls with the cart panel; quantity limits match the persisted cart contract. */
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
                {!item.available && <p role="status">Unavailable — remove this item to continue.</p>}
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
                    disabled={!item.available || item.quantity >= MAX_QUANTITY}
                >
                    +
                </button>
                <button className="ord-qty-btn remove" onClick={() => onRemove(item.variant_id)} aria-label={`Remove ${item.product_name}`}>
                    <Icon name="trash2" size={13} />
                </button>
            </div>
        </div>
    );
}
