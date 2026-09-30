import { useState } from "react";
import { useStaffList } from "../query";
import { ROLE_CONFIG } from "../staffValidation";
import { formatDate } from "@/lib/date";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { DropDown } from "@/components/filters/DropDown";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Kitchen" },
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

/**
 * COLUMNS — single source of truth for alignment.
 * The header cell and every body cell of a column share the same
 * alignment token, so headers always sit exactly over their values.
 * No fixed widths: auto layout hugs content, so the gap between any
 * two columns is always the same uniform cell padding (balanced).
 */
const COLUMNS = {
  name: { label: "Name", align: "", cell: "max-w-[180px] truncate font-medium whitespace-nowrap" },
  email: { label: "Email", align: "", cell: "max-w-[260px] truncate text-muted-foreground" },
  role: { label: "Role", align: "text-center", cell: "text-center whitespace-nowrap" },
  status: { label: "Status", align: "text-center", cell: "text-center whitespace-nowrap" },
  lastLogin: { label: "Last Login", align: "", cell: "text-xs whitespace-nowrap text-muted-foreground" },
  actions: { label: "Actions", align: "text-center", cell: "text-center whitespace-nowrap" },
};
const COLUMN_KEYS = ["name", "email", "role", "status", "lastLogin", "actions"];

export default function StaffTable({
  onAdd,
  onEdit,
  onToggleActive,
  onDelete,
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
  const allStaff = data?.data?.staff ?? [];
  const staff = allStaff.filter((s) => s.role !== "admin");
  const totalItems = data?.data?.totalItems ?? 0;

  return (
    <div className="relative border border-border rounded-xl overflow-hidden">
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
            {COLUMN_KEYS.map((key) => (
              <TableHead key={key} className={COLUMNS[key].align}>
                {COLUMNS[key].label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
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
                  <TableCell className={COLUMNS.name.cell}>{s.name}</TableCell>
                  <TableCell className={COLUMNS.email.cell}>{s.email}</TableCell>
                  <TableCell className={COLUMNS.role.cell}>
                    <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
                  </TableCell>
                  <TableCell className={COLUMNS.status.cell}>
                    <Badge variant={s.is_active ? "success" : "destructive"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className={COLUMNS.lastLogin.cell}>
                    {s.last_login_at ? formatDate(s.last_login_at, "shortDate") : "Never"}
                  </TableCell>
                  <TableCell className={COLUMNS.actions.cell}>
                    <div className="flex items-center justify-center gap-1">
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
        pageSizeOptions={[20, 50, 100]}
        itemLabel="staff"
      />
    </div>
  );
}
