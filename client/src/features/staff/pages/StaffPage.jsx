/**
 * StaffPage — staff list + shifts views with create/edit/toggle flows.
 * WHY it exists: single orchestrator for staff CRUD and shift history/KPIs (ShiftsView).
 * Query keys consumed: staff/shift data via child hooks (["staff",...], ["shifts",...]);
 * page owns date-range params for shift KPIs. Guards: admin-only route; no BR-02 shift gate.
 * State: Query [] | local [view, showFormModal, selectedStaff, isEditMode, dateFrom, dateTo] | Zustand [].
 */
import { useState } from "react";
import { toast } from "sonner";
import { useStaffMutations } from "../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import StaffTable from "../components/StaffTable";
import StaffFormModal from "../components/StaffFormModal";
import StaffKpis from "../components/StaffKpis";
import ShiftsView from "@/features/shifts/components/ShiftsView";
import ShiftKpis from "@/features/shifts/components/ShiftKpis";
import { FilterPill } from "@/components/filters/FilterPill";

export default function StaffPage() {
  const [view, setView] = useState("list");
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

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
          setShowFormModal(false);
          if (res.data?.emailed === false) {
            toast.warning("Staff created, but invite email failed", {
              description: "Ask them to use Forgot password instead.",
            });
          } else {
            toast.success("Staff created — set-password link emailed", {
              description: "They will set their own password from the email.",
            });
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
    </div>
  );
}
