import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { formatDate } from "@/lib/date";
import { orderNumberLabel } from "@/lib/orderNumber";

/**
 * STATUS_CONFIG — display info for each order status.
 */
const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  preparing: { label: "Preparing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/**
 * OrderTable
 *
 * Scan surface for the orders queue — view-only rows (click opens the
 * detail modal, which owns all actions). Six columns, no wrapping cells.
 */
export default function OrderTable({ orders, isLoading, onView }) {
  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[16%]">Order #</TableHead>
              <TableHead className="w-[24%]">Customer</TableHead>
              <TableHead className="w-[9%] whitespace-nowrap">Table</TableHead>
              <TableHead className="w-[13%] text-right whitespace-nowrap">Total</TableHead>
              <TableHead className="w-[15%] pl-6 whitespace-nowrap">Status</TableHead>
              <TableHead className="w-[23%] whitespace-nowrap">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
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
      <div className="flex flex-col items-center justify-center py-16">
        <Icon name="cart" size={48} className="text-muted-foreground/30" />
        <p className="mt-4 text-sm font-medium text-muted-foreground">No orders found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Fixed layout + weighted widths (sum 100%): each column fits its
          content, so inter-column gaps stay visually even. Customer takes
          the flexible share; compact columns never sprawl. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[16%]">Order #</TableHead>
            <TableHead className="w-[24%]">Customer</TableHead>
            <TableHead className="w-[9%] whitespace-nowrap">Table</TableHead>
            <TableHead className="w-[13%] text-right whitespace-nowrap">Total</TableHead>
            <TableHead className="w-[15%] pl-6 whitespace-nowrap">Status</TableHead>
            <TableHead className="w-[23%] whitespace-nowrap">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

            return (
              <TableRow
                key={order.order_id}
                onClick={() => onView?.(order)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-mono font-medium whitespace-nowrap">
                  {orderNumberLabel(order.order_number)}
                </TableCell>
                <TableCell className="truncate">{order.customer_name}</TableCell>
                <TableCell className="tabular-nums whitespace-nowrap">{order.table_number}</TableCell>
                <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                  ₱{Number(order.total_amount).toLocaleString()}
                </TableCell>
                <TableCell className="whitespace-nowrap pl-6">
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(order.created_at, "shortDate")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
