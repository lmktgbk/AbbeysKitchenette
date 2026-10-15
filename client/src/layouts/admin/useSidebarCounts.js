import { useProductSummary } from "@/features/products/query";
import { useIngredientSummary } from "@/features/ingredients/query";
import { useOrderStats } from "@/features/orders/query";
import { useAnomalyStats } from "@/features/anomalyDetection/query";
import { useOpenShiftCount } from "@/features/shifts/query";
import { useProductsRealtime, useInventoryRealtime, useOrdersRealtime, useAnomalyRealtime, useShiftsRealtime } from "@/realtime/subscriptions";
import { sidebarCounts } from "./sidebarCounts";

/** Reuse cached module summaries; live topic invalidation replaces badge polling. */
export function useSidebarCounts() {
  useProductsRealtime(); useInventoryRealtime(); useOrdersRealtime(); useAnomalyRealtime(); useShiftsRealtime();
  const products = useProductSummary();
  const inventory = useIngredientSummary();
  const orders = useOrderStats({ scope: "active" });
  const anomalies = useAnomalyStats();
  const shifts = useOpenShiftCount();
  return sidebarCounts({
    products: !products.isError ? products.data?.data?.summary : undefined,
    inventory: !inventory.isError ? inventory.data?.data?.summary : undefined,
    orders: !orders.isError ? orders.data?.data?.stats : undefined,
    anomalies: !anomalies.isError ? anomalies.data?.data : undefined,
    shifts: !shifts.isError ? shifts.data?.data : undefined,
  });
}
