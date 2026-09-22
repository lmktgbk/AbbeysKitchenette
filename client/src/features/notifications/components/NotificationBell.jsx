import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { useInfiniteNotifications, useUnreadCount, useNotificationMutations } from "../query";
import NotificationItem from "./NotificationItem";

const TYPE_FILTERS = {
  all: { label: "All", types: [] },
  orders: { label: "Orders", types: ["order_new", "order_completed", "order_accepted", "order_cancelled"] },
  stock: { label: "Stock", types: ["stock_low", "stock_out", "stock_restocked"] },
  system: { label: "System", types: ["system"] },
};

const PAGE_SIZE = 20;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const dropdownRef = useRef(null);
  const listRef = useRef(null);
  const sentinelRef = useRef(null);

  const { data: unreadData } = useUnreadCount();
  const {
    data: notifData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteNotifications({ limit: PAGE_SIZE, types: TYPE_FILTERS[typeFilter].types });
  const mutations = useNotificationMutations();

  const unreadCount = unreadData?.data?.unread_count || 0;
  const pages = notifData?.pages || [];
  const notifications = pages.flatMap((p) => p?.data?.notifications || []);
  const totalItems = pages[0]?.data?.totalItems ?? 0;

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    if (!open || !hasNextPage) return;
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { root, rootMargin: "100px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, hasNextPage, fetchNextPage, typeFilter, notifications.length]);

  function handleToggle() {
    setOpen((prev) => !prev);
  }

  function handleMarkAllRead() {
    mutations.markAllAsRead.mutate();
  }

  function handleMarkRead(id) {
    mutations.markAsRead.mutate(id);
  }

  function handleDelete(id) {
    mutations.deleteNotification.mutate(id);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden rounded-lg border bg-card shadow-lg animate-in fade-in slide-in-from-top-2 duration-150 z-50">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex gap-1.5 border-b px-4 py-2">
            {Object.entries(TYPE_FILTERS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  typeFilter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div ref={listRef} className="overflow-y-auto max-h-72">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">Loading…</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">Couldn't load notifications</p>
                <button
                  onClick={() => refetch()}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Icon name="bell" size={32} className="mb-2 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <>
                {notifications.map((notif) => (
                  <NotificationItem
                    key={notif.id}
                    notification={notif}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDelete}
                  />
                ))}
                <div ref={sentinelRef} />
                {isFetchingNextPage && (
                  <p className="py-2 text-center text-xs text-muted-foreground">Loading more…</p>
                )}
              </>
            )}
          </div>

          {!isLoading && totalItems > 0 && (
            <div className="border-t px-4 py-2 text-center text-[11px] text-muted-foreground">
              Showing {notifications.length} of {totalItems}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
