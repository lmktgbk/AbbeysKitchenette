import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factory ────────────────────── */

const notificationKeys = {
  all: ["notifications"],
  list: (params) => ["notifications", "list", params],
  unreadCount: ["notifications", "unread-count"],
};

/* ── Query Hooks ────────────────────── */

/**
 * useNotifications — paginated notification list.
 */
export function useNotifications(params = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => api.getNotificationsRequest(params),
    refetchInterval: 30000,
  });
}

/**
 * useUnreadCount — notification unread count (polls every 15s).
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: api.getUnreadCountRequest,
    refetchInterval: 15000,
  });
}

/* ── Mutation Hooks ─────────────────── */

/**
 * useNotificationMutations — all notification mutations.
 */
export function useNotificationMutations() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  }

  return {
    markAsRead: useMutation({
      mutationFn: api.markAsReadRequest,
      onSuccess: () => invalidateAll(),
    }),

    markAllAsRead: useMutation({
      mutationFn: api.markAllAsReadRequest,
      onSuccess: () => invalidateAll(),
    }),

    deleteNotification: useMutation({
      mutationFn: api.deleteNotificationRequest,
      onSuccess: () => invalidateAll(),
    }),
  };
}
