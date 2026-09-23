import { guestRepository } from "./guest.repository.js";
import { orderService } from "../orders/order.service.js";
import { orderRepository } from "../orders/order.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import crypto from "crypto";

/**
 * Guest Service
 *
 * Public, unauthenticated customer surface (menu, order placement, tracking).
 * Trust boundary: guests can only ever read their own order via its random
 * token — prices are re-computed server-side, edits/cancels happen at the
 * counter. Rate limiters (not validation) are the anti-spam layer here.
 */

export const guestService = {
  /**
   * Get available menu items.
   * @param {object} params - { search, category }
   * @returns {Array} - formatted products
   */
  async getMenu({ search, category }) {
    const products = await guestRepository.getAvailableProducts({ search, category });

    return products.map((p) => ({
      product_id: p.productId,
      product_name: p.productName,
      description: p.description,
      image_url: p.imageUrl,
      is_available: p.isAvailable,
      subcategory_id: p.subcategory?.subcategoryId ?? null,
      subcategory_name: p.subcategory?.subcategoryName ?? null,
      category_name: p.subcategory?.category?.categoryName ?? null,
      variants: p.variants.map((v) => ({
        variant_id: v.variantId,
        size_name: v.sizeName,
        price: Number(v.price),
        is_available: v.isAvailable,
        is_manually_deactivated: v.isManuallyDeactivated,
      })),
    }));
  },

  /**
   * Place an online order (status: pending).
   * Generates a guest token for order tracking.
   * @param {object} data - { customerName, tableNumber, items }
   * @returns {object} - created order with guest_token
   */
  async placeOrder({ customerName, tableNumber, items }) {
    const guestToken = crypto.randomUUID();

    const order = await orderService.createOnline({
      customerName,
      tableNumber,
      items,
      guestToken,
    });

    return order;
  },

  /**
   * Track an order by its guest token (public, read-only).
   * Returns a trimmed tracking view — no cost, deduction, or actor internals.
   */
  async getByToken(token) {
    const order = await orderRepository.findByGuestToken(token);
    if (!order) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");

    return {
      order_id: order.orderId,
      order_number: order.orderNumber,
      customer_name: order.customerName,
      table_number: order.tableNumber,
      order_source: order.orderSource,
      status: order.status,
      total_amount: Number(order.totalAmount),
      order_date: order.orderDate,
      created_at: order.createdAt,
      accepted_at: order.acceptedAt ?? null,
      preparing_at: order.preparingAt ?? null,
      completed_at: order.completedAt ?? null,
      items: (order.items ?? []).map((item) => ({
        product_name: item.product?.productName ?? null,
        size_name: item.variant?.sizeName ?? null,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        subtotal: item.subtotal != null ? Number(item.subtotal) : null,
        is_prepared: !!item.isPrepared,
      })),
    };
  },
};
