import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { formatDate } from "@/lib/date";

/**
 * STATUS_CONFIG — display info for each order status.
 */
const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  next_in_line: { label: "Next in Line", variant: "purple" },
  processing: { label: "Processing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const SOURCE_CONFIG = {
  walk_in: { label: "Walk-in", icon: "user" },
  online: { label: "Online", icon: "send" },
};

/**
 * OrderTable
 *
 * Paginated table of orders with status badges and action buttons.
 */
export default function OrderTable({ orders, isLoading, onView, onAdvance, onCancel }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!orders?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
        <Icon name="cart" size={48} className="text-muted-foreground/30" />
        <p className="mt-4 text-sm font-medium text-muted-foreground">No orders found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Table</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const source = SOURCE_CONFIG[order.order_source] || SOURCE_CONFIG.walk_in;

            return (
              <TableRow
                key={order.order_id}
                onClick={() => onView?.(order)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-mono font-medium">
                  #{order.order_number}
                </TableCell>
                <TableCell>{order.customer_name}</TableCell>
                <TableCell>{order.table_number}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name={source.icon} size={14} />
                    {source.label}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  ₱{Number(order.total_amount).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(order.created_at, "shortDate")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {order.status !== "completed" && order.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onAdvance?.(order)}
                        title="Advance"
                      >
                        <Icon name="circleArrowRight" size={16} />
                      </Button>
                    )}
                    {(order.status === "accepted" || order.status === "next_in_line" || order.status === "pending") && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onCancel?.(order)}
                        title="Cancel"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Icon name="trash2" size={16} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
