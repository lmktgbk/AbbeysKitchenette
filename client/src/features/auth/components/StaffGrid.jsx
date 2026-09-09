import { useState, useEffect } from "react";
import { getStaffListRequest } from "../api";
import Icon from "@/components/ui/icon";
import { toast } from "sonner";

const ROLES = [
  { key: "cashier", label: "Cashier", icon: "shoppingBag", description: "Point of Sale" },
  { key: "kitchen", label: "Kitchen", icon: "chefHat", description: "Order Preparation" },
];

/**
 * StaffGrid — two-phase login flow.
 * Phase 1: Select role (Cashier / Kitchen)
 * Phase 2: Select profile from filtered staff list
 */
export default function StaffGrid({ onStaffSelect }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    getStaffListRequest()
      .then((res) => setStaffList(res.data.staff))
      .catch(() => {
        setError("Failed to load staff list.");
        toast.error("Failed to load staff list.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredStaff = selectedRole
    ? staffList.filter((s) => s.role === selectedRole)
    : [];

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  // Phase 2: Profile grid
  if (selectedRole) {
    const roleLabel = ROLES.find((r) => r.key === selectedRole)?.label;
    return (
      <div className="space-y-4 animate-in fade-in-0 duration-300">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedRole(null)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <p className="text-sm font-semibold text-foreground">{roleLabel} Staff</p>
        </div>

        {filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Icon name="users" size={28} className="mb-2 opacity-40" />
            <p className="text-sm">No {roleLabel.toLowerCase()} staff found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto pr-1">
            {filteredStaff.map((staff) => (
              <button
                key={staff.id}
                onClick={() => onStaffSelect(staff)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/40 p-4 cursor-pointer transition-all hover:border-primary hover:bg-card/70"
              >
                <Icon name="user" size={24} className="text-muted-foreground" />
                <span className="text-sm font-medium text-center leading-tight">{staff.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Phase 1: Role selection
  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <p className="text-center text-sm font-medium">Select your role</p>
      <div className="grid grid-cols-2 gap-4">
        {ROLES.map((role) => {
          const count = staffList.filter((s) => s.role === role.key).length;
          return (
            <button
              key={role.key}
              onClick={() => setSelectedRole(role.key)}
              className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 p-6 cursor-pointer transition-all hover:border-primary hover:bg-card/70"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Icon name={role.icon} size={22} className="text-primary" />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold text-foreground block">{role.label}</span>
                <span className="text-[11px] text-muted-foreground">{count} staff</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
