export const CART_KEY = "smartcafe:guest-cart:v1";
export const CART_TTL = 24 * 60 * 60 * 1000;
export const MAX_LINES = 100;
export const MAX_QUANTITY = 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cartIntent(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.slice(0, MAX_LINES).filter(item => {
    if (!item || !uuid.test(item.product_id) || !Number.isInteger(item.variant_id) || item.variant_id <= 0 ||
      item.variant_id > 2147483647 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY || seen.has(item.variant_id)) return false;
    seen.add(item.variant_id);
    return true;
  }).map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity }));
}

export function readCart(storage, now = Date.now()) {
  try {
    const text = storage?.getItem(CART_KEY);
    if (!text || text.length > 20000) return [];
    const draft = JSON.parse(text);
    if (draft.version !== 1 || !Number.isFinite(draft.savedAt) || draft.savedAt > now || now - draft.savedAt >= CART_TTL) return [];
    return cartIntent(draft.items);
  } catch { return []; }
}

export function writeCart(storage, items, now = Date.now()) {
  try {
    const intent = cartIntent(items);
    if (intent.length) storage?.setItem(CART_KEY, JSON.stringify({ version: 1, savedAt: now, items: intent }));
    else storage?.removeItem(CART_KEY);
  } catch { /* Storage restrictions must not prevent editing the in-memory cart. */ }
}

export function reconcileCart(intent, products) {
  const variants = new Map(products.flatMap(product => (product.variants ?? []).map(variant => [variant.variant_id, { product, variant }])));
  return cartIntent(intent).map(item => {
    const match = variants.get(item.variant_id);
    const owned = match?.product.product_id === item.product_id;
    const price = owned ? Number(match.variant.price) : NaN;
    const available = owned && match.product.is_available !== false && match.variant.is_available !== false &&
      !match.variant.is_manually_deactivated && Number.isFinite(price) && price > 0;
    return { ...item, product_name: owned ? match.product.product_name : "Unavailable item",
      size_name: owned && match.variant.size_name !== "Default" ? match.variant.size_name : null,
      unit_price: Number.isFinite(price) && price > 0 ? price : 0, available: Boolean(available) };
  });
}

export function sameCartQuote(previous, next) {
  return previous.length === next.length && previous.every((item, index) => {
    const current = next[index];
    return item.product_id === current.product_id && item.variant_id === current.variant_id &&
      item.quantity === current.quantity && item.unit_price === current.unit_price && item.available === current.available;
  });
}
