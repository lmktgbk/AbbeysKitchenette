import { useState } from "react";
import { useStaffList } from "../query";
import { ROLE_CONFIG } from "../staffValidation";
import { formatDate } from "@/lib/date";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { DropDown } from "@/components/filters/DropDown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Kitchen" },
  { value: "admin", label: "Admin" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS = [
  { value: "name_asc", label: "Name: A → Z" },
  { value: "name_desc", label: "Name: Z → A" },
  { value: "email_asc", label: "Email: A → Z" },
  { value: "role_asc", label: "Role: A → Z" },
  { value: "isActive_desc", label: "Status: Active First" },
  { value: "isActive_asc", label: "Status: Inactive First" },
  { value: "lastLoginAt_desc", label: "Last Login: Recent First" },
  { value: "createdAt_desc", label: "Newest First" },
];

export default function StaffTable({
  onAdd,
  onEdit,
  onToggleActive,
  onResetPin,
  onDelete,
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeSort, setActiveSort] = useState("name_asc");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [sortBy, sortDir] = activeSort.includes("_desc")
    ? [activeSort.replace("_desc", ""), "desc"]
    : [activeSort.replace("_asc", ""), "asc"];

  const queryParams = {
    page: currentPage,
    limit: pageSize,
    search: search || undefined,
    role: roleFilter,
    status: statusFilter,
    sortBy,
    sortDir,
  };

  const { data, isLoading } = useStaffList(queryParams);
  const staff = data?.data?.staff ?? [];
  const totalItems = data?.data?.totalItems ?? 0;

  return (
    <div className="relative border border-border rounded-xl">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SearchBar
            value={search}
            onChange={(val) => { setSearch(val); setCurrentPage(1); }}
            placeholder="Search staff..."
          />
        </div>

        <div className="flex items-center gap-2">
          <DropDown
            options={ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onChange={(val) => { setRoleFilter(val); setCurrentPage(1); }}
            placeholder="All Roles"
            size="sm"
          />
          <DropDown
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            placeholder="All Status"
            size="sm"
          />
          <Button size="sm" onClick={onAdd}>
            <Icon name="plus" size={14} />
            <span className="hidden sm:inline">Add Staff</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-center">Role</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : staff.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <div className="flex flex-col items-center justify-center py-12">
                  <Icon name="users" size={48} className="text-muted-foreground/30" />
                  <p className="mt-4 text-sm font-medium text-muted-foreground">No staff found</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            staff.map((s) => {
              const roleConfig = ROLE_CONFIG[s.role] || ROLE_CONFIG.cashier;
              return (
                <TableRow key={s.staff_id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={s.is_active ? "success" : "destructive"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.last_login_at ? formatDate(s.last_login_at, "shortDate") : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onEdit(s)}
                        title="Edit"
                      >
                        <Icon name="pencil" size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onToggleActive(s)}
                        title={s.is_active ? "Deactivate" : "Activate"}
                      >
                        <Icon name={s.is_active ? "eyeOff" : "eye"} size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onResetPin(s)}
                        title="Reset PIN"
                      >
                        <Icon name="key" size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onDelete(s)}
                        title="Delete"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Icon name="trash2" size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <Pagination
        totalItems={totalItems}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        itemLabel="staff"
      />
    </div>
  );
}
