import { useState } from "react";
import { toast } from "sonner";
import { useIngredientMutations } from "../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import KpiCards from "../components/KpiCards";
import IngredientTable from "../components/IngredientTable";
import IngredientFormModal from "../components/IngredientFormModal";
import RestockModal from "../components/RestockModal";
import LossModal from "../components/LossModal";
import BatchListModal from "../components/BatchListModal";
import StockAlerts from "../components/sidebar/StockAlerts";
import ReorderSuggestions from "../components/sidebar/ReorderSuggestions";
import WasteInsights from "../components/sidebar/WasteInsights";

/**
 * InventoryPage
 *
 * Main orchestrator for the Inventory module.
 * Manages state and mutations only — all UI is delegated to child components.
 *
 * Layout:
 * - KpiCards (summary stats)
 * - IngredientTable (data table with filters and actions)
 * - Modals (form, restock, loss, batch list)
 * - Confirmations via ConfirmDialog (archive, restore, delete)
 */
export default function InventoryPage() {
  const mutations = useIngredientMutations();

  // ── Modal state ─────────────────────
  const [showFormModal, setShowFormModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchModalIngredient, setBatchModalIngredient] = useState(null);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // ── Mutations (hook handles invalidation; component handles toast + UI state) ──

  const createMutation = {
    mutate: (data) =>
      mutations.create.mutate(data, {
        onSuccess: () => {
          toast.success("Ingredient created");
          setShowFormModal(false);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to create ingredient"),
      }),
    isPending: mutations.create.isPending,
  };

  const updateMutation = {
    mutate: ({ id, data }) =>
      mutations.update.mutate({ id, data }, {
        onSuccess: () => {
          toast.success("Ingredient updated");
          setShowFormModal(false);
          setSelectedIngredient(null);
          setIsEditMode(false);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to update ingredient"),
      }),
    isPending: mutations.update.isPending,
  };

  const restockMutation = {
    mutate: ({ id, data }) =>
      mutations.restock.mutate({ id, data }, {
        onSuccess: () => {
          toast.success("Ingredient restocked");
          setShowRestockModal(false);
          setSelectedIngredient(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to restock ingredient"),
      }),
    isPending: mutations.restock.isPending,
  };

  const lossMutation = {
    mutate: ({ id, data }) =>
      mutations.loss.mutate({ id, data }, {
        onSuccess: () => {
          toast.success("Loss declared");
          setShowLossModal(false);
          setSelectedIngredient(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to declare loss"),
      }),
    isPending: mutations.loss.isPending,
  };

  const archiveMutation = {
    mutate: (id) =>
      mutations.archive.mutate(id, {
        onSuccess: () => {
          toast.success("Ingredient archived");
          setSelectedIngredient(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to archive ingredient"),
      }),
  };

  const restoreMutation = {
    mutate: (id) =>
      mutations.restore.mutate(id, {
        onSuccess: () => {
          toast.success("Ingredient restored");
          setSelectedIngredient(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to restore ingredient"),
      }),
  };

  const deleteMutation = {
    mutate: (id) =>
      mutations.remove.mutate(id, {
        onSuccess: () => {
          toast.success("Ingredient deleted permanently");
          setSelectedIngredient(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to delete ingredient"),
      }),
  };

  // ── Handlers ────────────────────────

  function handleAdd() {
    setSelectedIngredient(null);
    setIsEditMode(false);
    setShowFormModal(true);
  }

  function handleEdit(ingredient) {
    setSelectedIngredient(ingredient);
    setIsEditMode(true);
    setShowFormModal(true);
  }

  function handleRestock(ingredient) {
    setSelectedIngredient(ingredient);
    setShowRestockModal(true);
  }

  function handleLoss(ingredient) {
    setSelectedIngredient(ingredient);
    setShowLossModal(true);
  }

  function handleBatches(ingredient) {
    setBatchModalIngredient(ingredient);
    setShowBatchModal(true);
  }

  async function handleArchive(ingredient) {
    const ok = await confirm({
      title: "Archive Ingredient?",
      message: `This will hide "${ingredient.ingredient_name}" from active lists.`,
      note: "This ingredient can be restored later from the Archived view.",
      confirmLabel: "Archive",
      loadingText: "Archiving...",
      variant: "danger",
      onConfirm: () => mutations.archive.mutateAsync(ingredient.ingredient_id),
    });
    if (ok) toast.success("Ingredient archived");
  }

  async function handleRestore(ingredient) {
    const ok = await confirm({
      title: "Restore Ingredient?",
      message: `This will restore "${ingredient.ingredient_name}" to active lists.`,
      note: "The ingredient will reappear in your inventory and can be restocked or used immediately.",
      confirmLabel: "Restore",
      loadingText: "Restoring...",
      variant: "success",
      onConfirm: () => mutations.restore.mutateAsync(ingredient.ingredient_id),
    });
    if (ok) toast.success("Ingredient restored");
  }

  async function handleDelete(ingredient) {
    const ok = await confirm({
      title: "Delete Permanently?",
      message: `This will permanently delete "${ingredient.ingredient_name}".`,
      note: "This action cannot be undone. All associated data will be lost.",
      confirmLabel: "Delete",
      loadingText: "Deleting...",
      variant: "danger",
      onConfirm: () => mutations.remove.mutateAsync(ingredient.ingredient_id),
    });
    if (ok) toast.success("Ingredient deleted permanently");
  }

  function handleFormSubmit(data) {
    if (isEditMode && selectedIngredient) {
      updateMutation.mutate({ id: selectedIngredient.ingredient_id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isFormLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Summary Cards */}
      <KpiCards />

      {/* Two-column layout: Table + Sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] items-start">
        {/* Left — Table */}
        <IngredientTable
          onAdd={handleAdd}
          onEdit={handleEdit}
          onRestock={handleRestock}
          onLoss={handleLoss}
          onBatches={handleBatches}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />

        {/* Right — Sidebar panels */}
        <div className="flex flex-col gap-4">
          <StockAlerts onRestock={handleRestock} />
          <ReorderSuggestions />
          <WasteInsights />
        </div>
      </div>

      {/* ── Modals ─────────────────────── */}

      {/* Add/Edit Ingredient Modal */}
      <IngredientFormModal
        key={isEditMode && selectedIngredient ? selectedIngredient.ingredient_id : "add"}
        open={showFormModal}
        onOpenChange={setShowFormModal}
        ingredient={isEditMode ? selectedIngredient : null}
        onSubmit={handleFormSubmit}
        isLoading={isFormLoading}
      />

      {/* Restock Modal */}
      <RestockModal
        open={showRestockModal}
        onOpenChange={setShowRestockModal}
        ingredient={selectedIngredient}
        onSubmit={(data) =>
          restockMutation.mutate({
            id: selectedIngredient?.ingredient_id,
            data,
          })
        }
        isLoading={restockMutation.isPending}
      />

      {/* Loss Modal */}
      <LossModal
        open={showLossModal}
        onOpenChange={setShowLossModal}
        ingredient={selectedIngredient}
        onSubmit={(data) =>
          lossMutation.mutate({
            id: selectedIngredient?.ingredient_id,
            data,
          })
        }
        isLoading={lossMutation.isPending}
      />

      {/* Batches & History Modal */}
      <BatchListModal
        open={showBatchModal}
        onOpenChange={setShowBatchModal}
        ingredient={batchModalIngredient}
      />

    </div>
  );
}
