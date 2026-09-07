export default function NextCard({ order }) {
  if (!order) {
    return (
      <div className="bg-muted/50 border border-dashed border-border rounded-lg px-4 py-5 text-center">
        <div className="text-xs text-muted-foreground opacity-40">No order in next position</div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-4 kds-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="bg-background border border-border rounded-full px-1.5 py-0.5 text-[9px] font-bold text-chart-1">
            PREPARE AHEAD
          </span>
          <div className="font-serif text-xl font-bold mt-1 text-foreground">
            #{order.order_number}
          </div>
          <div className="text-sm font-medium text-foreground/80">{order.customer_name}</div>
          <div className="text-[10px] text-muted-foreground">
            Table {order.table_number} ·{" "}
            {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </div>
        </div>
        <div className="font-serif text-base font-bold mt-1 text-amber-500">
          {`\u20B1${Number(order.total_amount).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
        </div>
      </div>
      <div className="space-y-1.5 mt-3">
        {order.items?.map((item, i) => {
          const label = item.size_name
            ? `${item.product_name} (${item.size_name})`
            : item.product_name;
          return (
            <div key={item.order_item_id ?? i} className="flex items-center gap-2 px-2.5 py-1.5 bg-background border border-border rounded">
              <span className="text-xs font-medium flex-1 text-foreground/80">{label}</span>
              <span className="text-xs font-bold text-muted-foreground">×{item.quantity}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
