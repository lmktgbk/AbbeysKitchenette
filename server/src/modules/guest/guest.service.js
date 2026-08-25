import { guestRepository } from "./guest.repository.js";
import { orderService } from "../orders/order.service.js";
import crypto from "crypto";

/**
 * Guest Service
 *
 * Public API business logic for customer-facing operations.
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
      category_name: p.category?.categoryName ?? null,
      variants: p.variants.map((v) => ({
        variant_id: v.variantId,
        size_name: v.sizeName,
        price: Number(v.price),
        is_available: v.isAvailable,
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
};
