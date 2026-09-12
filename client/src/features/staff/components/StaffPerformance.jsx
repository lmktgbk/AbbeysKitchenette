import { useState, useEffect, useRef } from "react";
import { useStaffPerformance } from "../query";
import { useOrderList, useOrderDetail } from "@/features/orders/query";
import { ROLE_CONFIG } from "../staffValidation";
import { SearchBar } from "@/components/filters/SearchBar";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { FilterPill } from "@/components/filters/FilterPill";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import OrderDetailModal from "@/features/orders/components/OrderDetailModal";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  preparing: { label: "Preparing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const SOURCE_ICONS = {
  walk_in: "store",
  online: "globe",
};

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
];

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const ROLE_COLORS = {
  cashier: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  kitchen: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

export default function StaffPerformance() {
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const { data, isLoading } = useStaffPerformance({});
  const performance = data?.data?.performance ?? [];

  const { data: detailData, isLoading: detailLoading } = useOrderDetail(selectedOrderId);
  const orderDetail = detailData?.data?.order ?? null;

  const grouped = {};
  for (const p of performance) {
    if (!grouped[p.role]) grouped[p.role] = [];
    grouped[p.role].push(p);
  }

  const cashiers = grouped.cashier || [];
  const kitchen = grouped.kitchen || [];

  return (
    <div className="flex flex-col gap-4">
      {selectedStaff ? (
        <StaffOrdersView
          staff={selectedStaff}
          onBack={() => setSelectedStaff(null)}
          onSelectOrder={setSelectedOrderId}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-20 w-full animate-pulse rounded-lg bg-muted" />
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
            role="cashier"
            onSelect={setSelectedStaff}
          />
          <StaffColumn
            title="Kitchen"
            icon="chefHat"
            members={kitchen}
            role="kitchen"
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

function StaffColumn({ title, icon, members, role, onSelect }) {
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
              className={cn(
                "w-full rounded-lg border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                role === "cashier" ? "border-l-2 border-l-amber-500 border-border" : "border-l-2 border-l-blue-500 border-border",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  ROLE_COLORS[role] || "bg-muted text-muted-foreground",
                )}>
                  {getInitials(m.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{m.name}</span>
                    <Badge variant={ROLE_CONFIG[m.role]?.variant || "default"} className="text-[10px] shrink-0">
                      {ROLE_CONFIG[m.role]?.label || m.role}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {role === "cashier" ? (
                      <>
                        <span>{m.orders_created} orders</span>
                        <span className="font-semibold text-foreground">₱{Number(m.total_revenue || 0).toLocaleString()}</span>
                        <span>₱{Number(m.avg_order_value || 0).toLocaleString()} avg</span>
                      </>
                    ) : (
                      <>
                        <span>{m.orders_completed} orders</span>
                        <span className="font-semibold text-foreground">
                          {m.avg_prep_time != null ? `${m.avg_prep_time} min avg` : "—"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StaffOrdersView({ staff, onBack, onSelectOrder }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const orderParams = {
    staff_id: staff.user_id,
    limit: 50,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data: ordersData, isLoading: ordersLoading } = useOrderList(orderParams);
  const staffOrders = ordersData?.data?.orders ?? [];

  const isCashier = staff.role === "cashier";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Icon name="arrowLeft" size={14} />
          Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold",
          ROLE_COLORS[staff.role] || "bg-muted text-muted-foreground",
        )}>
          {getInitials(staff.name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{staff.name}</span>
            <Badge variant={ROLE_CONFIG[staff.role]?.variant || "default"} className="text-[10px]">
              {ROLE_CONFIG[staff.role]?.label || staff.role}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isCashier
              ? `${staff.orders_created} orders · ₱${Number(staff.total_revenue || 0).toLocaleString()} revenue · ₱${Number(staff.avg_order_value || 0).toLocaleString()} avg`
              : `${staff.orders_completed} orders completed · ${staff.avg_prep_time != null ? `${staff.avg_prep_time} min avg prep` : "—"}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search orders by customer..."
          className="w-64"
        />
        <DateRangeFilter
          dateFrom={dateFrom || null}
          dateTo={dateTo || null}
          onDateChange={(from, to) => {
            setDateFrom(from || "");
            setDateTo(to || "");
          }}
        />
        <FilterPill
          options={ORDER_STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        {(search || dateFrom || dateTo || statusFilter !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setStatusFilter("all");
            }}
            className="text-xs text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Order table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-3">
          {ordersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : staffOrders.length === 0 ? (
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
                {staffOrders.map((o) => {
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
    </div>
  );
}
