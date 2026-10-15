const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : undefined;

/** Counts are global, independent of each page's filters and date range. */
export function sidebarCounts({ products, inventory, orders, anomalies, shifts }) {
  return {
    "/products": products ? count(products.unavailable) : undefined,
    "/inventory": inventory ? count(Number(inventory.low) + Number(inventory.out)) : undefined,
    "/orders": orders ? count(Number(orders.pending) + Number(orders.accepted) + Number(orders.preparing)) : undefined,
    "/anomalies": anomalies ? count(anomalies.total) : undefined,
    "/staff": shifts ? count(shifts.count) : undefined,
  };
}

export const sidebarCountLabels = {
  "/products": "unavailable products", "/inventory": "low or out-of-stock ingredients",
  "/orders": "active orders", "/anomalies": "active anomalies", "/staff": "open shifts",
};
