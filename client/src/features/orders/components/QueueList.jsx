export default function QueueList({ orders }) {
  if (orders.length === 0) {
    return (
      <div className="text-center text-[11px] py-6 text-muted-foreground opacity-40">
        Queue is empty
      </div>
    );
  }

  return orders.map((order, idx) => (
    <div key={order.order_id} className="bg-background border border-border rounded-lg p-2.5 kds-fade-in">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-muted text-muted-foreground">
            {idx + 1}
          </div>
          <span className="font-mono text-[11px] font-bold text-foreground/80">
            #{order.order_number}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
        </span>
      </div>
      <div className="text-xs font-medium mb-0.5 text-muted-foreground">
        {order.customer_name} · T{order.table_number?.replace(/^T/i, "")}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {order.items?.map((item) => {
          const label = item.size_name
            ? `${item.product_name} (${item.size_name})`
            : item.product_name;
          return `${label} ×${item.quantity}`;
        }).join(" · ")}
      </div>
    </div>
  ));
}
