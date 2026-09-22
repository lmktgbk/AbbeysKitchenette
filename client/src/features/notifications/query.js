import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factory ────────────────────── */

const notificationKeys = {
  all: ["notifications"],
  list: (params) => ["notifications", "list", params],
  infiniteList: (params) => ["notifications", "list", "infinite", params],
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
 * useInfiniteNotifications — paged notification history for infinite scroll.
 * Each page resolves to the { success, message, data } envelope where
 * data = { notifications, totalItems }.
 */
export function useInfiniteNotifications({ limit = 20, types = [] } = {}) {
  const sorted = [...types].sort();
  const params = { limit, ...(sorted.length > 0 ? { type: sorted.join(",") } : {}) };
  return useInfiniteQuery({
    queryKey: notificationKeys.infiniteList(params),
    queryFn: ({ pageParam = 1 }) => api.getNotificationsRequest({ ...params, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const total = lastPage?.data?.totalItems ?? 0;
      const loaded = allPages.reduce(
        (n, p) => n + (p?.data?.notifications?.length ?? 0),
        0,
      );
      return loaded < total ? allPages.length + 1 : undefined;
    },
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
