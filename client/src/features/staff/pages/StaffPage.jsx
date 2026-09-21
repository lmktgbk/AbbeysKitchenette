import { useState } from "react";
import { toast } from "sonner";
import { useStaffMutations } from "../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import StaffTable from "../components/StaffTable";
import StaffFormModal from "../components/StaffFormModal";
import StaffKpis from "../components/StaffKpis";
import ShiftsView from "@/features/shifts/components/ShiftsView";
import ShiftKpis from "@/features/shifts/components/ShiftKpis";
import ResetPasswordModal from "../components/ResetPasswordModal";
import { FilterPill } from "@/components/filters/FilterPill";

/**
 * StaffPage
 *
 * Main orchestrator for staff management.
 * Two views: Staff List (default) and Shifts (drawer sessions).
 */
export default function StaffPage() {
  const [view, setView] = useState("list");
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [createdPassword, setCreatedPassword] = useState(null);
  const [createdStaffName, setCreatedStaffName] = useState(null);

  // Date range shared by the Shifts KPIs + history (empty = today).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const shiftRangeParams = {
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const mutations = useStaffMutations();

  // ── Create ────────────────
  function handleAdd() {
    setSelectedStaff(null);
    setIsEditMode(false);
    setShowFormModal(true);
  }

  function handleFormSubmit(data) {
    if (isEditMode) {
      mutations.update.mutate(
        { id: selectedStaff.staff_id, data },
        {
          onSuccess: () => {
            toast.success("Staff updated");
            setShowFormModal(false);
          },
          onError: (err) =>
            toast.error(err.response?.data?.message || "Update failed"),
        }
      );
    } else {
      mutations.create.mutate(data, {
        onSuccess: (res) => {
          toast.success("Staff created");
          setShowFormModal(false);
          if (res.data?.temp_password) {
            setCreatedPassword(res.data.temp_password);
            setCreatedStaffName(res.data.staff?.name || data.name);
          }
        },
        onError: (err) =>
          toast.error(err.response?.data?.message || "Creation failed"),
      });
    }
  }

  // ── Edit ────────────────
  function handleEdit(staff) {
    setSelectedStaff(staff);
    setIsEditMode(true);
    setShowFormModal(true);
  }

  // ── Toggle Active ────────────────
  async function handleToggleActive(staff) {
    const action = staff.is_active ? "deactivate" : "activate";
    const ok = await confirm({
      title: `${action === "deactivate" ? "Deactivate" : "Activate"} Staff?`,
      message: `This will ${action} "${staff.name}". ${
        action === "deactivate"
          ? "They will not be able to log in."
          : "They will be able to log in again."
      }`,
      confirmLabel: action === "deactivate" ? "Deactivate" : "Activate",
      loadingText: `${action === "deactivate" ? "Deactivating" : "Activating"}...`,
      variant: action === "deactivate" ? "danger" : "success",
      onConfirm: () => mutations.toggleActive.mutateAsync(staff.staff_id),
    });
    if (ok) toast.success(`Staff ${action}d`);
  }

  // ── Reset Password ────────────────
  function handleResetPassword(staff) {
    setSelectedStaff(staff);
    setShowResetPasswordModal(true);
  }

  function handleResetPasswordSubmit(data) {
    mutations.resetPassword.mutate(
      { id: selectedStaff.staff_id, data },
      {
        onSuccess: () => {
          toast.success("Password reset — temp password emailed", {
            description: `${selectedStaff?.name} must change it on next login.`,
          });
          setShowResetPasswordModal(false);
        },
        onError: (err) =>
          toast.error(err.response?.data?.message || "Password reset failed"),
      }
    );
  }

  // ── Delete ────────────────
  async function handleDelete(staff) {
    const ok = await confirm({
      title: "Delete Permanently?",
      message: `This will permanently delete "${staff.name}".`,
      note: "This action cannot be undone.",
      confirmLabel: "Delete",
      loadingText: "Deleting...",
      variant: "danger",
      onConfirm: () => mutations.remove.mutateAsync(staff.staff_id),
    });
    if (ok) toast.success("Staff deleted permanently");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* View-aware KPIs — crossfade with the pill below */}
      <div key={view} className="kds-fade-in">
        {view === "list" ? <StaffKpis /> : <ShiftKpis params={shiftRangeParams} />}
      </div>

      {/* View Toggle */}
      <FilterPill
        options={[
          { value: "list", label: "Staff List" },
          { value: "shifts", label: "Shifts" },
        ]}
        value={view}
        onChange={setView}
        className="w-fit"
      />

      {/* Content */}
      {view === "list" ? (
        <StaffTable
          onAdd={handleAdd}
          onEdit={handleEdit}
          onToggleActive={handleToggleActive}
          onResetPassword={handleResetPassword}
          onDelete={handleDelete}
        />
      ) : (
        <ShiftsView
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => { setDateFrom(from || ""); setDateTo(to || ""); }}
        />
      )}

      {/* Modals */}
      <StaffFormModal
        open={showFormModal}
        onOpenChange={setShowFormModal}
        staff={selectedStaff}
        isEditMode={isEditMode}
        onSubmit={handleFormSubmit}
        isLoading={mutations.create.isPending || mutations.update.isPending}
      />

      <ResetPasswordModal
        open={showResetPasswordModal}
        onOpenChange={setShowResetPasswordModal}
        staff={selectedStaff}
        onSubmit={handleResetPasswordSubmit}
        isLoading={mutations.resetPassword.isPending}
      />

      {/* Password Display Modal */}
      {createdPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">
              Credentials Created
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Share this password with <strong>{createdStaffName}</strong> in person.
              This password will not be shown again.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground">Temporary Password</p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground">
                {createdPassword}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The staff member will be asked to change it on first login.
            </p>
            <button
              onClick={() => {
                setCreatedPassword(null);
                setCreatedStaffName(null);
              }}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              I have saved this password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
