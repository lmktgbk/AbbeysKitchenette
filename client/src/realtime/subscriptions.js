/**
 * Realtime Subscriptions — topic-to-query mappings (Phase 1).
 *
 * WHY it exists: one place declaring which screens listen to which
 * server topics. Events carry invalidations only; each handler refetches
 * through the existing TanStack Query keys, so UI logic never changes and
 * the DB stays source of truth. Mount the hook for the screen you render:
 *
 *   OrdersPage .......... useOrdersRealtime + useLedgerRealtime
 *   KitchenDisplay ...... useKitchenRealtime
 *   NotificationBell .... useNotificationsRealtime (admin bell)
 *   InventoryPage ....... useInventoryRealtime
 *   PosInterface ........ useOrdersRealtime (pending feed) + useProductsRealtime (menu)
 *   ProductGrid ......... useProductsRealtime
 *   ShiftBanner ......... useShiftsRealtime
 *   TransactionsView .... useLedgerRealtime
 *
 * Server emit points mirror this file (server/src/realtime/events.js,
 * auditLogService.logAction, anomaly scans).
 * Guest menu stays mount-fresh (no public availability topic).
 *
 * Phase 2 mounts:
 *   DashboardPage ....... useDashboardRealtime
 *   AnomalyPage ......... useAnomalyRealtime
 *   StaffPage ........... useStaffRealtime
 *   AuditLogsPage ....... useAuditRealtime
 *   SettingsPage ........ useSettingsRealtime
 *   ShiftsView .......... useShiftsRealtime
 *   ShiftDetailDrawer ... useShiftsRealtime + useOrdersRealtime
 *   TrackingPage ........ useGuestRealtime(token)
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeRealtime } from "./socket";
import { invalidateTopicQueries, productRefreshKeys } from "./queryInvalidation";

function useTopics(topics, keys) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubs = topics.map((topic) =>
      subscribeRealtime(topic, () => {
        invalidateTopicQueries(queryClient, keys);
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
    // topics/keys are static per hook — resubscribe only if client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}

/** Order queues, detail, stats, POS pending feed. */
export function useOrdersRealtime() {
  useTopics(["orders"], [["orders"]]);
}

/** Kitchen display + batch groups. */
export function useKitchenRealtime() {
  useTopics(["kitchen", "orders"], [["orders"]]);
}

/** Admin bell (list + unread count). Admins only — server ACL enforces. */
export function useNotificationsRealtime() {
  useTopics(["notifications:all"], [["notifications"]]);
}

/** Stock screens, batches, reorder/waste lists. */
export function useInventoryRealtime() {
  useTopics(["inventory"], [["ingredients"]]);
}

/** POS/admin menus, product grid, categories. */
export function useProductsRealtime() {
  useTopics(["products"], productRefreshKeys);
}

/** Drawer banners, summaries, history. */
export function useShiftsRealtime() {
  useTopics(["shifts"], [["shifts"]]);
}

/** Money ledger (every entry originates from an order/shift write). */
export function useLedgerRealtime() {
  useTopics(["orders", "shifts"], [["transactions"]]);
}

/** Dashboard cards, trends, ops (KPIs invalidate on order/shift/anomaly). */
export function useDashboardRealtime() {
  useTopics(["orders", "shifts", "anomaly"], [["dashboard"], ["analytics"]]);
}

/** Anomaly list, stats, badge. */
export function useAnomalyRealtime() {
  useTopics(["anomaly"], [["anomalies"]]);
}

/** Admin staff roster screens. */
export function useStaffRealtime() {
  useTopics(["staff"], [["staff"]]);
}

/** Audit trail page. */
export function useAuditRealtime() {
  useTopics(["audit"], [["auditLogs"]]);
}

/** Settings page + public store settings (tills re-read hours/payments). */
export function useSettingsRealtime() {
  useTopics(["settings"], [["settings"], ["landing", "storeSettings"]]);
}

/**
 * Guest order tracking (public, token-gated — possession authorizes).
 * Replaces the 15s useGuestOrder poll.
 */
export function useGuestRealtime(token) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!token) return undefined;
    return subscribeRealtime(`guest:${token}`, () => {
      queryClient.invalidateQueries({ queryKey: ["guest"] });
    });
  }, [queryClient, token]);
}
