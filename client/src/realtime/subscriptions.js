/**
 * Screen-scoped topic subscriptions map server invalidations to existing query
 * prefixes. Mounting a hook registers handlers; unmounting removes only those
 * handlers. The server authorizes each subscription, and REST authorizes refetches.
 * Server emitters live in server/src/infrastructure/realtime/events.js.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeRealtime } from "./socket";
import { invalidateTopicQueries, productRefreshKeys } from "./queryInvalidation";

/** Subscribe static screen mappings once per query client; callers must not pass changing filter-dependent arrays. */
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

/** Refresh ingredient-prefixed stock queries; advisory lists use separate keys and are not included here. */
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
 * Refetches guest-prefixed queries on tracking events and rejoin acknowledgements;
 * changing the token removes the previous topic handler before subscribing again.
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
