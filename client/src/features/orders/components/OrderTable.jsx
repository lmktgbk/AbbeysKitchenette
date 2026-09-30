import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, MoneyCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { formatDate, formatTime } from "@/lib/date";
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
 * COLUMNS — single source of truth for alignment.
 * The header cell and every body cell of a column share the same
 * alignment token, so headers always sit exactly over their values.
 * No fixed widths: auto layout hugs content, so the gap between any
 * two columns is always the same uniform cell padding (balanced).
 */
const COLUMNS = {
  order: { label: "Order #", align: "", cell: "font-mono font-medium whitespace-nowrap" },
  customer: { label: "Customer", align: "", cell: "max-w-[240px] truncate" },
  table: { label: "Table", align: "", cell: "tabular-nums whitespace-nowrap" },
  total: { label: "Total", align: "text-right pr-10", cell: "whitespace-nowrap pr-10" },
  status: { label: "Status", align: "text-center", cell: "text-center whitespace-nowrap" },
  created: { label: "Created", align: "", cell: "text-xs text-muted-foreground whitespace-nowrap" },
  time: { label: "Time", align: "", cell: "text-xs text-muted-foreground tabular-nums whitespace-nowrap" },
};
const COLUMN_KEYS = ["order", "customer", "table", "total", "status", "created", "time"];

/**
 * OrderTable
 *
 * Scan surface for the orders queue — view-only rows (click opens the
 * detail modal, which owns all actions). Seven columns, no wrapping cells.
 */
export default function OrderTable({ orders, isLoading, onView }) {
  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMN_KEYS.map((key) => (
                <TableHead key={key} className={COLUMNS[key].align}>
                  {COLUMNS[key].label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
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
      {/* Auto layout hugs content: every inter-column gap is the same uniform padding. */}
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMN_KEYS.map((key) => (
              <TableHead key={key} className={COLUMNS[key].align}>
                {COLUMNS[key].label}
              </TableHead>
            ))}
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
                <TableCell className={COLUMNS.order.cell}>
                  {orderNumberLabel(order.order_number)}
                </TableCell>
                <TableCell className={COLUMNS.customer.cell}>{order.customer_name}</TableCell>
                <TableCell className={COLUMNS.table.cell}>{order.table_number}</TableCell>
                <MoneyCell className={COLUMNS.total.cell}>
                  ₱{Number(order.total_amount).toLocaleString()}
                </MoneyCell>
                <TableCell className={COLUMNS.status.cell}>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className={COLUMNS.created.cell}>
                  {formatDate(order.created_at, "shortDate")}
                </TableCell>
                <TableCell className={COLUMNS.time.cell}>
                  {formatTime(order.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
