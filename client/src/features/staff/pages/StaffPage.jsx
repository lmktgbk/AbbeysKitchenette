import { useState } from "react";
import { toast } from "sonner";
import { useStaffMutations } from "../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import StaffTable from "../components/StaffTable";
import StaffFormModal from "../components/StaffFormModal";
import StaffPerformance from "../components/StaffPerformance";
import ResetPinModal from "../components/ResetPinModal";
import { FilterPill } from "@/components/filters/FilterPill";

/**
 * StaffPage
 *
 * Main orchestrator for staff management.
 * Two views: Staff List (default) and Staff Performance.
 */
export default function StaffPage() {
  const [view, setView] = useState("list");
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [createdPin, setCreatedPin] = useState(null);
  const [createdStaffName, setCreatedStaffName] = useState(null);

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
          if (res.data?.raw_pin) {
            setCreatedPin(res.data.raw_pin);
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

  // ── Reset PIN ────────────────
  function handleResetPin(staff) {
    setSelectedStaff(staff);
    setShowResetPinModal(true);
  }

  function handleResetPinSubmit(data) {
    mutations.resetPin.mutate(
      { id: selectedStaff.staff_id, data },
      {
        onSuccess: (res) => {
          toast.success("PIN reset successfully");
          setShowResetPinModal(false);
          if (res.data?.raw_pin) {
            setCreatedPin(res.data.raw_pin);
            setCreatedStaffName(selectedStaff.name);
          }
        },
        onError: (err) =>
          toast.error(err.response?.data?.message || "PIN reset failed"),
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
      {/* View Toggle */}
      <FilterPill
        options={[
          { value: "list", label: "Staff List" },
          { value: "performance", label: "Staff Performance" },
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
          onResetPin={handleResetPin}
          onDelete={handleDelete}
        />
      ) : (
        <StaffPerformance />
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

      <ResetPinModal
        open={showResetPinModal}
        onOpenChange={setShowResetPinModal}
        staff={selectedStaff}
        onSubmit={handleResetPinSubmit}
        isLoading={mutations.resetPin.isPending}
      />

      {/* PIN Display Modal */}
      {createdPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">
              Credentials Created
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Share this PIN with <strong>{createdStaffName}</strong> in person.
              This PIN will not be shown again.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-xs font-medium text-muted-foreground">PIN</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-foreground">
                {createdPin}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The staff member will also receive this PIN via email. They will be
              asked to change it on first login.
            </p>
            <button
              onClick={() => {
                setCreatedPin(null);
                setCreatedStaffName(null);
              }}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              I have saved this PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
