import Icon from "@/components/ui/icon";

const TYPE_ICONS = {
  order_new: "cart",
  order_completed: "checkCircle",
  order_cancelled: "alertCircle",
  stock_low: "alertTriangle",
  stock_out: "trendingDown",
  stock_restocked: "checkCircle",
  system: "info",
  anomaly: "alertTriangle",
};

const TYPE_COLORS = {
  order_new: "text-blue-500",
  order_completed: "text-green-500",
  order_cancelled: "text-red-500",
  stock_low: "text-amber-500",
  stock_out: "text-red-500",
  stock_restocked: "text-green-500",
  system: "text-muted-foreground",
  anomaly: "text-amber-500",
};

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationItem({ notification, onMarkRead, onDelete }) {
  const { id, type, title, message, is_read, created_at } = notification;
  const iconName = TYPE_ICONS[type] || "bell";
  const iconColor = TYPE_COLORS[type] || "text-muted-foreground";

  function handleClick() {
    if (!is_read) {
      onMarkRead(id);
    }
  }

  function handleDelete(e) {
    e.stopPropagation();
    onDelete(id);
  }

  return (
    <div
      onClick={handleClick}
      className={`flex gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 ${
        !is_read ? "bg-muted/30" : ""
      }`}
    >
      <div className={`mt-0.5 shrink-0 ${iconColor}`}>
        <Icon name={iconName} size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-tight ${!is_read ? "font-medium" : "text-foreground"}`}>
            {title}
          </p>
          <button
            onClick={handleDelete}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Delete notification"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">{formatTimeAgo(created_at)}</p>
      </div>
      {!is_read && (
        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  );
}
