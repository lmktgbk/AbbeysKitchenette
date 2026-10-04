import { orderRepository } from "./order.repository.js";
import { settingsService } from "../settings/settings.service.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { LIMITS } from "../../utils/validation.js";

export const ITEM_DISCOUNT_TYPES = ["none", "senior", "pwd", "promo"];

// Existing business rule: senior/PWD lines receive a fixed 20% discount.
export const SENIOR_PWD_DISCOUNT_PERCENT = 20;

export function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Choose a refund without exceeding the action's net reduction or remaining tender.
 * paid excludes cash change; priorRefunded is the cumulative saved refund.
 * Call with values read under the order lock. This calculation performs no writes.
 */
export function computeRefundAmount({ limit, paid, priorRefunded, option, requestedAmount }) {
  const available = Math.max(0, roundMoney(paid - priorRefunded));
  let amount = 0;
  if (option === "full") {
    amount = Math.min(limit, available);
  } else if (option !== "none" && requestedAmount != null) {
    amount = Math.min(Number(requestedAmount), limit, available);
  }
  return Math.max(0, roundMoney(amount));
}

/**
 * Compute discount + net total from a subtotal.
 * Senior/PWD: fixed 20%. Promo: manual percent or peso amount (capped at subtotal).
 * @param {number} subtotal
 * @param {object} input - { discount_type, promo_mode, promo_value }
 * @returns {{ discountType, discountPercent, discountAmount, total }}
 */
export function computeDiscountedTotal(subtotal, input = {}) {
  const base = roundMoney(subtotal);
  const type = input.discount_type ?? "none";

  if (type === "senior" || type === "pwd") {
    const amount = roundMoney((base * SENIOR_PWD_DISCOUNT_PERCENT) / 100);
    return {
      discountType: type,
      discountPercent: SENIOR_PWD_DISCOUNT_PERCENT,
      discountAmount: amount,
      total: roundMoney(base - amount),
    };
  }

  if (type === "promo") {
    if (input.promo_mode === "percent") {
      const pct = Math.min(Number(input.promo_value ?? 0), 100);
      const amount = roundMoney((base * pct) / 100);
      return { discountType: type, discountPercent: pct, discountAmount: amount, total: roundMoney(base - amount) };
    }
    const amount = Math.min(roundMoney(Number(input.promo_value ?? 0)), base);
    return { discountType: type, discountPercent: 0, discountAmount: amount, total: roundMoney(base - amount) };
  }

  return { discountType: "none", discountPercent: 0, discountAmount: 0, total: base };
}

/**
 * Compute discount for a SINGLE order line.
 * Enforces the one-discount-per-item rule by construction: a line carries
 * exactly one discount_type, so senior/pwd/promo can never stack on one line.
 * @param {number} lineSubtotal - unit_price × quantity for this line
 * @param {object} input - { discount_type, promo_mode, promo_value }
 * @returns {{ discountType, discountPercent, discountAmount, total }}
 */
export function computeLineDiscount(lineSubtotal, input = {}) {
  const base = roundMoney(lineSubtotal);
  const type = ITEM_DISCOUNT_TYPES.includes(input.discount_type) ? input.discount_type : "none";

  if (type === "senior" || type === "pwd") {
    const amount = roundMoney((base * SENIOR_PWD_DISCOUNT_PERCENT) / 100);
    return {
      discountType: type,
      discountPercent: SENIOR_PWD_DISCOUNT_PERCENT,
      discountAmount: amount,
      total: roundMoney(base - amount),
    };
  }

  if (type === "promo") {
    if (input.promo_mode === "percent") {
      const pct = Math.min(Math.max(Number(input.promo_value ?? 0), 0), 100);
      const amount = roundMoney((base * pct) / 100);
      return { discountType: type, discountPercent: pct, discountAmount: amount, total: roundMoney(base - amount) };
    }
    const amount = Math.min(Math.max(roundMoney(Number(input.promo_value ?? 0)), 0), base);
    return { discountType: type, discountPercent: 0, discountAmount: amount, total: roundMoney(base - amount) };
  }

  return { discountType: "none", discountPercent: 0, discountAmount: 0, total: base };
}

/** Freeze a whole-bill discount onto paid lines so later removals retain the original cent allocation. */
export function allocateBillDiscount(items, discount) {
  const cents = items.map(item => Math.round(roundMoney(item.unit_price * item.quantity) * 100));
  const subtotal = cents.reduce((sum, value) => sum + value, 0);
  const discountCents = Math.round(discount.discountAmount * 100);
  // Allocate whole-bill input once at payment time. Integer ratios and a
  // deterministic remainder preserve every cent when items are removed later.
  const allocated = cents.map(value => subtotal
    ? Number(BigInt(discountCents) * BigInt(value) / BigInt(subtotal)) : 0);
  let remainder = discountCents - allocated.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0 && index < allocated.length; index++) {
    if (allocated[index] < cents[index]) { allocated[index]++; remainder--; }
  }
  return items.map((item, index) => ({
    ...item,
    discountType: discount.discountType,
    discountPercent: discount.discountPercent,
    discountAmount: allocated[index] / 100,
    discountLabel: null,
  }));
}

/**
 * Aggregate per-line discounts into order-level totals.
 * discountType: "none" (no lines discounted) | single type (all discounted
 * lines share it) | "mixed" (lines differ — e.g. pwd lines + regular lines).
 * discountPercent is meaningful only when every discounted line is a uniform
 * percent (senior/pwd 20% or a uniform promo %); otherwise 0 and clients
 * should read per-line percents.
 * @param {Array<{ lineSubtotal: number, discount: { discountType, discountPercent, discountAmount } }>} lines
 * @returns {{ subtotal, discountType, discountPercent, discountAmount, total }}
 */
export function aggregateLineDiscounts(lines = []) {
  const subtotal = roundMoney(lines.reduce((s, l) => s + Number(l.lineSubtotal || 0), 0));
  const discountAmount = roundMoney(lines.reduce((s, l) => s + Number(l.discount?.discountAmount || 0), 0));
  const used = [...new Set(lines.map((l) => l.discount?.discountType).filter((t) => t && t !== "none"))];
  const discountType = used.length === 0 ? "none" : used.length === 1 ? used[0] : "mixed";
  let discountPercent = 0;
  if (discountType === "senior" || discountType === "pwd") {
    discountPercent = SENIOR_PWD_DISCOUNT_PERCENT;
  } else if (discountType === "promo") {
    const pcts = [...new Set(lines.filter((l) => l.discount?.discountType === "promo").map((l) => Number(l.discount?.discountPercent || 0)))];
    discountPercent = pcts.length === 1 ? pcts[0] : 0;
  }
  return { subtotal, discountType, discountPercent, discountAmount, total: roundMoney(subtotal - discountAmount) };
}


/** Pricing reads precede business transactions; these methods never commit order or stock writes. */
export const orderPricing = {
  /* ── BR-01: Pricing Helpers ──────────── */

  /**
   * Re-price items from live variant prices (server authoritative) and
   * compute subtotal -> discount -> net total.
   * Supports two modes (backward compatible):
   * - Per-item mode: any item carries discount_type != "none" → each line is
   *   priced with computeLineDiscount (one discount per item, never stacked)
   *   and order totals are the Σ of lines (discountType "mixed" when lines differ).
   * - Legacy mode: no per-item discounts → whole-bill computeDiscountedTotal.
   * @param {Array} items - [{ product_id, variant_id, quantity, unit_price, discount_type?, promo_mode?, promo_value?, discount_label? }]
   * @param {object} discount - { discount_type, promo_mode, promo_value }
   * @returns {{ pricedItems, subtotal, discount, total }}
   */
  async _priceItemsAndTotals(items, discount = {}) {
    const variantIds = [...new Set(items.map((i) => i.variant_id))];
    const priceMap = await orderRepository.getVariantPrices(variantIds);

    const pricedItems = items.map((item) => {
      const livePrice = priceMap.get(item.variant_id);
      if (livePrice == null) {
        throw new AppError(400, `Variant ${item.variant_id} not found`, "VARIANT_NOT_FOUND");
      }
      // Cent-tolerance, not exact equality: float serialization across the
      // wire can drift by fractions of a centavo without any real price change.
      if (Math.abs(Number(item.unit_price) - livePrice) > 0.01) {
        throw new AppError(409, "Menu price changed — please refresh and try again", "PRICE_CHANGED");
      }
      return { ...item, unit_price: livePrice };
    });

    // Use authoritative prices for the storage budget, even when client prices pass cent tolerance.
    const gross = roundMoney(pricedItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0));
    if (!Number.isFinite(gross) || gross > LIMITS.money) throw new AppError(400, "Order subtotal exceeds the supported amount", "AMOUNT_OUT_OF_RANGE");

    const perItemMode = pricedItems.some(
      (i) => (i.discount_type ?? "none") !== "none",
    );

    if (perItemMode) {
      const lines = pricedItems.map((item) => {
        const lineSubtotal = roundMoney(item.unit_price * item.quantity);
        const d = computeLineDiscount(lineSubtotal, {
          discount_type: item.discount_type ?? "none",
          promo_mode: item.promo_mode,
          promo_value: item.promo_value,
        });
        return {
          ...item,
          discountType: d.discountType,
          discountPercent: d.discountPercent,
          discountAmount: d.discountAmount,
          discountLabel: d.discountType === "promo" ? (item.discount_label ?? null) : null,
          _lineSubtotal: lineSubtotal,
          _lineTotal: d.total,
        };
      });
      const agg = aggregateLineDiscounts(
        lines.map((l) => ({ lineSubtotal: l._lineSubtotal, discount: { discountType: l.discountType, discountPercent: l.discountPercent, discountAmount: l.discountAmount } })),
      );
      return {
        pricedItems: lines,
        subtotal: agg.subtotal,
        discount: { discountType: agg.discountType, discountPercent: agg.discountPercent, discountAmount: agg.discountAmount },
        total: agg.total,
      };
    }

    const subtotal = roundMoney(
      pricedItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    );
    const result = computeDiscountedTotal(subtotal, discount);
    return {
      pricedItems: allocateBillDiscount(pricedItems, result),
      subtotal,
      discount: result,
      total: result.total,
    };
  },

  /**
   * Resolve audit IDs + label for storage.
   * senior/pwd IDs are required by validation whenever their lines exist;
   * discount_id_no mirrors the legacy single-ID column for old receipts.
   */
  _resolveDiscountIdentity(discount = {}, pricedItems = [], aggregateType = "none") {
    const seniorIdNo = (discount.senior_id_no ?? "").trim?.()
      ? discount.senior_id_no.trim()
      : (aggregateType === "senior" || pricedItems.some((i) => (i.discountType ?? i.discount_type) === "senior"))
        ? (discount.discount_id_no?.trim?.() || null)
        : null;
    const pwdIdNo = (discount.pwd_id_no ?? "").trim?.()
      ? discount.pwd_id_no.trim()
      : (aggregateType === "pwd" || pricedItems.some((i) => (i.discountType ?? i.discount_type) === "pwd"))
        ? (discount.discount_id_no?.trim?.() || null)
        : null;
    const discountIdNo = (discount.discount_id_no?.trim?.() || null) ?? seniorIdNo ?? pwdIdNo;
    let discountLabel = discount.discount_label ?? null;
    if (discountLabel == null) {
      const promoLabels = pricedItems
        .filter((i) => (i.discountType ?? i.discount_type) === "promo")
        .map((i) => i.discountLabel ?? i.discount_label ?? null)
        .filter(Boolean);
      if (promoLabels.length === 1) discountLabel = promoLabels[0];
      else if (promoLabels.length > 1) discountLabel = promoLabels.join("; ");
    }
    return { discountIdNo, seniorIdNo, pwdIdNo, discountLabel };
  },

  /**
   * Validate payment against net total. Cash needs paid >= total.
   * E-wallets are record-only: paid must equal total, change is 0.
   * Also rejects methods disabled in Settings → acceptedPayments.
   */
  async _assertPaymentValid({ amountPaid, total, paymentMethod = "cash" }) {
    const accepted = await settingsService.getAcceptedPayments();
    if (!accepted.includes(paymentMethod)) {
      throw new AppError(403, `${paymentMethod} is currently not accepted`, "PAYMENT_DISABLED");
    }
    if (amountPaid == null || Number(amountPaid) <= 0) {
      throw new AppError(400, "Amount paid is required", "PAYMENT_REQUIRED");
    }
    if (paymentMethod === "cash") {
      if (Number(amountPaid) < total) {
        throw new AppError(400, "Amount paid is less than total", "INSUFFICIENT_PAYMENT");
      }
      return;
    }
    if (Math.abs(Number(amountPaid) - total) > 0.01) {
      throw new AppError(400, "E-wallet amount must equal the order total", "INVALID_PAYMENT_AMOUNT");
    }
  },

};
