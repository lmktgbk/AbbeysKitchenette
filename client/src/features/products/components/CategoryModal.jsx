import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useCategoryList, useCategoryMutations } from "../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { getApiErrorMessage } from "../product.utils";
import { createCategorySchema, editCategorySchema } from "../productValidation";

// ── Helpers (DRY) ───────────────────────────────────────

/** Show a toast error from an API error response. */
function handleMutationError(err, action) {
  toast.error(getApiErrorMessage(err, `Failed to ${action}`));
}

/**
 * CategoryModal
 *
 * Subcategory management modal.
 * Root categories (Food, Beverages) are read-only section headers.
 * Users add/edit/delete subcategories under each root.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - onCreated: (subcategory) => void — called when a subcategory is created (for auto-select in product form)
 * - standalone: boolean — if true, full management UI. If false, quick-create mode.
 * - categoryId: number — pre-selected parent category for quick subcategory create
 */
export default function CategoryModal({
  open,
  onOpenChange,
  onCreated,
  standalone = true,
  categoryId = null,
}) {
  const { data, isLoading } = useCategoryList();
  const { createSub, updateSub, removeSub } = useCategoryMutations();

  const categories = data?.data?.categories ?? [];

  const [mode, setMode] = useState(standalone ? "list" : "create");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [formParentId, setFormParentId] = useState(categoryId);

  function handleOpenCreateSub(parentCatId) {
    setMode("create");
    setEditData(null);
    setFormParentId(parentCatId);
  }

  function handleOpenEdit(sub) {
    setMode("edit");
    setEditingId(sub.subcategory_id);
    setEditData(sub);
    setFormParentId(sub.category_id);
  }

  function handleBack() {
    setMode("list");
    setEditingId(null);
    setEditData(null);
  }

  function handleSubmit(data) {
    const payload = {
      subcategory_name: data.subcategory_name.trim(),
      description: data.description?.trim() || undefined,
    };

    if (mode === "create") {
      createSub.mutate(
        { categoryId: formParentId, data: payload },
        {
          onSuccess: (res) => {
            toast.success("Category created");
            if (onCreated) onCreated(res.data.subcategory);
            if (standalone) handleBack();
            else onOpenChange(false);
          },
          onError: (err) => handleMutationError(err, "create category"),
        },
      );
    } else {
      updateSub.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast.success("Category updated"); handleBack(); },
          onError: (err) => handleMutationError(err, "update category"),
        },
      );
    }
  }

  async function handleDelete(sub) {
    if (sub.product_count > 0) {
      toast.error(`Cannot delete "${sub.subcategory_name}" — it has ${sub.product_count} product(s).`);
      return;
    }

    await confirm({
      title: "Delete Category",
      message: `Are you sure you want to delete "${sub.subcategory_name}"?`,
      confirmLabel: "Delete",
      variant: "danger",
      loadingText: "Deleting...",
      onConfirm: () => new Promise((resolve, reject) => {
        removeSub.mutate(sub.subcategory_id, {
          onSuccess: () => { toast.success("Category deleted"); resolve(); },
          onError: (err) => reject(err),
        });
      }),
    });
  }

  const isMutating = createSub.isPending || updateSub.isPending || removeSub.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>
            {mode === "list"
              ? "Manage Categories"
              : mode === "create"
                ? "Add Category"
                : "Edit Category"}
          </DialogTitle>
        </DialogHeader>

        {mode === "list" ? (
          <ListMode
            categories={categories}
            isLoading={isLoading}
            onAddSub={handleOpenCreateSub}
            onEditSub={handleOpenEdit}
            onDeleteSub={handleDelete}
          />
        ) : (
          <FormMode
            mode={mode}
            parentId={formParentId}
            editData={editData}
            onBack={handleBack}
            onSubmit={handleSubmit}
            isMutating={isMutating}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── List Mode ───────────────────────────────────────────

/**
 * ListMode — displays root categories as section headers with their subcategories.
 * Root categories are read-only. Only subcategories can be added/edited/deleted.
 *
 * Props:
 * - categories: Array<{ category_id, category_name, subcategories: [...] }>
 * - isLoading: boolean
 * - onAddSub: (categoryId) => void
 * - onEditSub: (subcategory) => void
 * - onDeleteSub: (subcategory) => void
 */
function ListMode({
  categories,
  isLoading,
  onAddSub,
  onEditSub,
  onDeleteSub,
}) {
  return (
    <div className="flex max-h-[50vh] flex-col">
      <div className="mb-3">
        <p className="text-xs text-muted-foreground">
          Root categories are managed by the system. Add categories under them.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10">
          <Icon name="tag" size={32} className="mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No categories yet</p>
        </div>
      ) : (
        <div className="space-y-1 overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div key={cat.category_id}>
              {/* Root category — read-only header */}
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {cat.category_name}
                  </span>
                  <Icon name="lock" size={12} className="shrink-0 text-muted-foreground/50" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {cat.subcategories?.length ?? 0} sub{(cat.subcategories?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onAddSub(cat.category_id)}
                  className="rounded-md p-1.5 text-primary hover:bg-primary/10"
                  title="Add category"
                >
                  <Icon name="folderPlus" size={18} />
                </button>
              </div>

              {/* Subcategories */}
              {cat.subcategories?.length > 0 && (
                <div className="ml-4 space-y-0.5 border-l border-border pl-2 mt-0.5">
                  {cat.subcategories.map((sub) => (
                    <div
                      key={sub.subcategory_id}
                      className="group flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-1.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm text-foreground">
                          {sub.subcategory_name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {sub.product_count} {sub.product_count === 1 ? "product" : "products"}
                        </span>
                      </div>
                      <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onEditSub(sub)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSub(sub)}
                          disabled={sub.product_count > 0}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                          title={sub.product_count > 0 ? "Cannot delete — has products" : "Delete"}
                        >
                          <Icon name="trash2" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Form Mode (create / edit) ──────────────────────────

/**
 * FormMode — self-contained form for creating or editing a category.
 * Uses react-hook-form + zod for validation.
 * Parent is implicit from the folderPlus click — no dropdown needed.
 *
 * Props:
 * - mode: "create" | "edit"
 * - parentId: number — the root category ID (implicit from folderPlus click)
 * - editData: object | null — existing subcategory data when editing
 * - onBack: () => void
 * - onSubmit: (data) => void — called with validated form data
 * - isMutating: boolean — disables submit while saving
 */
function FormMode({
  mode,
  editData,
  onBack,
  onSubmit,
  isMutating,
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(mode === "edit" ? editCategorySchema : createCategorySchema),
    defaultValues: {
      subcategory_name: editData?.subcategory_name ?? "",
      description: editData?.description ?? "",
    },
  });

  // Reset form when mode or editData changes
  useEffect(() => {
    reset({
      subcategory_name: editData?.subcategory_name ?? "",
      description: editData?.description ?? "",
    });
  }, [mode, editData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Category Name
        </label>
        <Input
          {...register("subcategory_name")}
          placeholder="e.g. Pork"
          autoFocus
          error={errors.subcategory_name?.message}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Description
        </label>
        <textarea
          {...register("description")}
          placeholder="Optional description..."
          rows={2}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        {errors.description && (
          <p className="mt-1.5 text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isMutating}>
          {isMutating ? "Saving..." : mode === "create" ? "Add" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
