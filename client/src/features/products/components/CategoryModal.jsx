import { useState } from "react";
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

/**
 * CategoryModal
 *
 * Category management modal — list, create, edit, delete.
 * Opened from the ProductGrid toolbar "Manage Categories" button
 * or from the ProductFormModal "Add Category" button.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - onCreated: (category) => void — called when a category is created (for auto-select)
 * - standalone: boolean — if true, shows list mode. If false, starts in create mode.
 */
export default function CategoryModal({
  open,
  onOpenChange,
  onCreated,
  standalone = true,
}) {
  const { data, isLoading } = useCategoryList();
  const { create, update, remove } = useCategoryMutations();

  const categories = data?.data?.categories ?? [];

  const [mode, setMode] = useState(standalone ? "list" : "create"); // list | create | edit
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSort, setFormSort] = useState(0);

  function handleOpenCreate() {
    setMode("create");
    setFormName("");
    setFormDesc("");
    setFormSort(0);
  }

  function handleOpenEdit(cat) {
    setMode("edit");
    setEditingId(cat.category_id);
    setFormName(cat.category_name);
    setFormDesc(cat.description || "");
    setFormSort(cat.sort_order);
  }

  function handleBack() {
    setMode("list");
    setEditingId(null);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const payload = {
      category_name: formName.trim(),
      description: formDesc.trim() || undefined,
      sort_order: Number(formSort) || 0,
    };

    if (!payload.category_name) {
      toast.error("Category name is required");
      return;
    }

    if (mode === "create") {
      create.mutate(payload, {
        onSuccess: (res) => {
          toast.success("Category created");
          if (onCreated) {
            onCreated(res.data);
          }
          if (standalone) {
            handleBack();
          } else {
            onOpenChange(false);
          }
        },
        onError: (err) => {
          toast.error(err?.response?.data?.message || "Failed to create category");
        },
      });
    } else {
      update.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast.success("Category updated");
            handleBack();
          },
          onError: (err) => {
            toast.error(err?.response?.data?.message || "Failed to update category");
          },
        },
      );
    }
  }

  async function handleDelete(cat) {
    if (cat.product_count > 0) {
      toast.error(`Cannot delete "${cat.category_name}" — it has ${cat.product_count} product(s). Reassign or remove products first.`);
      return;
    }

    const ok = await confirm({
      title: "Delete Category",
      message: `Are you sure you want to delete "${cat.category_name}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });

    if (!ok) return;

    remove.mutate(cat.category_id, {
      onSuccess: () => toast.success("Category deleted"),
      onError: (err) => {
        toast.error(err?.response?.data?.message || "Failed to delete category");
      },
    });
  }

  const isMutating = create.isPending || update.isPending || remove.isPending;

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
            onAdd={handleOpenCreate}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
          />
        ) : (
          <FormMode
            mode={mode}
            name={formName}
            desc={formDesc}
            sort={formSort}
            onNameChange={setFormName}
            onDescChange={setFormDesc}
            onSortChange={setFormSort}
            onBack={handleBack}
            onSubmit={handleSubmit}
            isMutating={isMutating}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── List Mode ──────────────────────────────── */

function ListMode({ categories, isLoading, onAdd, onEdit, onDelete }) {
  return (
    <div className="flex max-h-[50vh] flex-col">
      {/* Add button */}
      <div className="mb-3">
        <Button size="sm" onClick={onAdd}>
          <Icon name="plus" size={14} className="mr-1" />
          Add Category
        </Button>
      </div>

      {/* Category list */}
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
            <div
              key={cat.category_id}
              className="group flex items-center justify-between rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {cat.category_name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {cat.product_count} {cat.product_count === 1 ? "product" : "products"}
                  </span>
                </div>
                {cat.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {cat.description}
                  </p>
                )}
              </div>

              <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(cat)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Edit category"
                >
                  <Icon name="pencil" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(cat)}
                  disabled={cat.product_count > 0}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  title={
                    cat.product_count > 0
                      ? "Cannot delete — has products"
                      : "Delete category"
                  }
                >
                  <Icon name="trash2" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Form Mode (create / edit) ─────────────── */

function FormMode({
  mode,
  name,
  desc,
  sort,
  onNameChange,
  onDescChange,
  onSortChange,
  onBack,
  onSubmit,
  isMutating,
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Category Name
        </label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Coffee"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Description
        </label>
        <textarea
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="Optional description..."
          rows={2}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Sort Order
        </label>
        <Input
          type="number"
          min="0"
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-24"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isMutating}>
          {isMutating
            ? "Saving..."
            : mode === "create"
              ? "Add Category"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
