import { useState } from "react";
import { useStaffPerformance } from "../query";
import { useOrderList, useOrderDetail } from "@/features/orders/query";
import { ROLE_CONFIG } from "../staffValidation";
import { DropDown } from "@/components/filters/DropDown";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import OrderDetailModal from "@/features/orders/components/OrderDetailModal";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  next_in_line: { label: "Next", variant: "purple" },
  processing: { label: "Processing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const SOURCE_ICONS = {
  walk_in: "store",
  online: "globe",
};

export default function StaffPerformance() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const queryParams = {
    role: roleFilter,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading } = useStaffPerformance(queryParams);
  const performance = data?.data?.performance ?? [];

  const orderParams = {
    staff_id: selectedStaff?.user_id || undefined,
    limit: 50,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data: ordersData, isLoading: ordersLoading } = useOrderList(orderParams);
  const staffOrders = ordersData?.data?.orders ?? [];

  const { data: detailData, isLoading: detailLoading } = useOrderDetail(selectedOrderId);
  const orderDetail = detailData?.data?.order ?? null;

  const ROLE_FILTER_OPTIONS = [
    { value: "all", label: "All Roles" },
    { value: "cashier", label: "Cashier" },
    { value: "kitchen", label: "Kitchen" },
  ];

  const grouped = {};
  for (const p of performance) {
    if (!grouped[p.role]) grouped[p.role] = [];
    grouped[p.role].push(p);
  }

  const cashiers = grouped.cashier || [];
  const kitchen = grouped.kitchen || [];

  function handleBack() {
    setSelectedStaff(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <DropDown
          options={ROLE_FILTER_OPTIONS}
          value={roleFilter}
          onChange={setRoleFilter}
          placeholder="All Roles"
          size="sm"
        />
        <DateRangeFilter
          dateFrom={dateFrom || null}
          dateTo={dateTo || null}
          onDateChange={(from, to) => {
            setDateFrom(from || "");
            setDateTo(to || "");
          }}
        />
        {(dateFrom || dateTo || roleFilter !== "all") && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setRoleFilter("all");
            }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {selectedStaff ? (
        <StaffOrdersView
          staff={selectedStaff}
          orders={staffOrders}
          isLoading={ordersLoading}
          onBack={handleBack}
          onSelectOrder={setSelectedOrderId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-16 w-full animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : performance.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <Icon name="users" size={48} className="mx-auto text-muted-foreground/30" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">No staff data available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StaffColumn
            title="Cashiers"
            icon="user"
            members={cashiers}
            isCashier={true}
            onSelect={setSelectedStaff}
          />
          <StaffColumn
            title="Kitchen"
            icon="chefHat"
            members={kitchen}
            isCashier={false}
            onSelect={setSelectedStaff}
          />
        </div>
      )}

      <OrderDetailModal
        open={!!selectedOrderId}
        onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}
        order={orderDetail}
        loading={detailLoading}
        showActions={false}
      />
    </div>
  );
}

function StaffColumn({ title, icon, members, isCashier, onSelect }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon name={icon} size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">({members.length})</span>
      </div>
      <div className="p-3 space-y-2">
        {members.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No {title.toLowerCase()} found</p>
        ) : (
          members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => onSelect(m)}
              className="w-full rounded-lg border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground">{m.name}</span>
                <Badge variant={ROLE_CONFIG[m.role]?.variant || "default"} className="text-[10px]">
                  {ROLE_CONFIG[m.role]?.label || m.role}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {isCashier ? (
                  <>
                    <span>{m.orders_created} orders</span>
                    <span>·</span>
                    <span className="font-semibold text-foreground">₱{Number(m.total_revenue || 0).toLocaleString()}</span>
                    <span>·</span>
                    <span>₱{Number(m.avg_order_value || 0).toLocaleString()} avg</span>
                  </>
                ) : (
                  <>
                    <span>{m.orders_completed} orders</span>
                    <span>·</span>
                    <span className="font-semibold text-foreground">
                      {m.avg_prep_time != null ? `${m.avg_prep_time} min avg` : "—"}
                    </span>
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StaffOrdersView({ staff, orders, isLoading, onBack, onSelectOrder, dateFrom, dateTo }) {
  const isCashier = staff.role === "cashier";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Icon name="arrowLeft" size={14} />
          Back
        </button>
        <div className="h-4 w-px bg-border" />
        <span className="text-sm font-semibold text-foreground">{staff.name}</span>
        <Badge variant={ROLE_CONFIG[staff.role]?.variant || "default"} className="text-[10px]">
          {ROLE_CONFIG[staff.role]?.label || staff.role}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {isCashier ? `${staff.orders_created} orders · ₱${Number(staff.total_revenue || 0).toLocaleString()}` : `${staff.orders_completed} orders · ${staff.avg_prep_time != null ? `${staff.avg_prep_time} min avg` : "—"}`}
        </span>
      </div>

      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="receipt" size={32} className="mx-auto text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">No orders found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-16">#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const status = STATUS_CONFIG[o.status] || STATUS_CONFIG.pending;
                return (
                  <TableRow
                    key={o.order_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectOrder(o.order_id)}
                  >
                    <TableCell className="font-mono text-xs font-bold">
                      {o.order_number}
                    </TableCell>
                    <TableCell className="text-sm">{o.customer_name}</TableCell>
                    <TableCell className="text-center">
                      <Icon
                        name={SOURCE_ICONS[o.order_source] || "helpCircle"}
                        size={14}
                        className="text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      ₱{Number(o.total_amount || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant} className="text-[10px]">
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDate(o.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
