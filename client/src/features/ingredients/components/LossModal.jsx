import { useState, useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropDown } from "@/components/filters/DropDown";
import { lossSchema } from "../ingredientValidation";
import { getIngredientBatchesRequest } from "../api";
import { formatDate } from "@/lib/date";

/**
 * LossModal
 *
 * Declare a loss for an ingredient (spoilage, spillage, expiry, other).
 * Fetches active batches on open — user can select a specific batch or leave as FIFO.
 * Shows estimated cost based on selected batch's cost per unit.
 * Allows manual override of total cost.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - ingredient: object (the ingredient)
 * - onSubmit: (data) => void
 * - isLoading: boolean
 */
export default function LossModal({
  open,
  onOpenChange,
  ingredient,
  onSubmit,
  isLoading,
}) {
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(lossSchema),
    defaultValues: {
      loss_type: "",
      quantity_lost: "",
      batch_id: "",
      total_cost: "",
      notes: "",
    },
  });

  const quantityLost = useWatch({ control, name: "quantity_lost" }) || 0;
  const selectedBatchId = useWatch({ control, name: "batch_id" });

  // Fetch active batches when modal opens
  useEffect(() => {
    if (!open || !ingredient) return;
    setBatchesLoading(true);
    getIngredientBatchesRequest(ingredient.ingredient_id, { page: 1, limit: 100 })
      .then((data) => {
        const list = (data.data?.batches ?? []).filter(
          (b) => Number(b.quantity_left ?? b.quantityLeft) > 0,
        );
        setBatches(list);
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || "Failed to load available batches"),
      )
      .finally(() => setBatchesLoading(false));
  }, [open, ingredient]);

  // Build normalized batch list for display
  const batchList = batches.map((b) => ({
    restockId: b.batch_id ?? b.restock_id ?? b.restockId,
    quantityLeft: Number(b.quantity_left ?? b.quantityLeft),
    costPerUnit: Number(b.cost_per_unit ?? b.costPerUnit),
    supplierName: b.supplier_name ?? b.supplierName,
    restockedAt: b.restocked_at ?? b.restockedAt,
  }));

  // Compute estimated cost based on selected batch or weighted avg
  const qty = Number(quantityLost);
  let estimatedCost = null;
  let costSource = "";

  if (qty > 0) {
    if (selectedBatchId) {
      // Specific batch selected — use its cost per unit
      const selected = batchList.find(
        (b) => String(b.restockId) === String(selectedBatchId),
      );
      if (selected) {
        estimatedCost = qty * selected.costPerUnit;
        costSource = `batch cost @ ₱${selected.costPerUnit.toFixed(4)}`;
      }
    } else if (batchList.length > 0) {
      // FIFO mode — compute weighted average cost from all active batches
      const totalStock = batchList.reduce((sum, b) => sum + b.quantityLeft, 0);
      if (totalStock > 0) {
        const weightedCost = batchList.reduce(
          (sum, b) => sum + b.costPerUnit * b.quantityLeft,
          0,
        ) / totalStock;
        estimatedCost = qty * weightedCost;
        costSource = `weighted avg cost @ ₱${weightedCost.toFixed(4)}`;
      }
    }
  }

  useEffect(() => {
    if (open) {
      reset({
        loss_type: "",
        quantity_lost: "",
        batch_id: "",
        total_cost: "",
        notes: "",
      });
    }
  }, [open, reset]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleFormSubmit(data) {
    // Clean optional fields
    const cleaned = { ...data };
    if (!cleaned.batch_id) delete cleaned.batch_id;
    if (cleaned.total_cost === "" || cleaned.total_cost === undefined || Number.isNaN(cleaned.total_cost)) {
      delete cleaned.total_cost;
    }
    if (!cleaned.notes) delete cleaned.notes;
    onSubmit(cleaned);
  }

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>Declare Loss</DialogTitle>
          <DialogDescription>
            {ingredient.ingredient_name} — Current stock:{" "}
            {ingredient.stock_quantity.toLocaleString()} {ingredient.unit}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-4"
        >
          {/* Batch Selection */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              From Batch
            </label>
            <Controller
              name="batch_id"
              control={control}
              render={({ field }) => (
                <DropDown
                  {...field}
                  options={[
                    { value: "", label: "FIFO (auto — oldest batch first)" },
                    ...(batchesLoading
                      ? []
                      : batchList.length === 0
                        ? []
                        : batchList.map((b) => ({
                          value: String(b.restockId),
                          label: `${formatDate(b.restockedAt, "shortDate")} — ${b.quantityLeft.toLocaleString()} remaining @ ₱${b.costPerUnit.toFixed(2)}${b.supplierName ? ` (${b.supplierName})` : ""}`,
                        }))),
                  ]}
                  placeholder={
                    batchesLoading
                      ? "Loading batches…"
                      : batchList.length === 0
                        ? "No batches with stock"
                        : "Select batch..."
                  }
                  disabled={batchesLoading}
                />
              )}
            />
          </div>

          {/* Loss Type */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Loss Type
            </label>
            <Controller
              name="loss_type"
              control={control}
              render={({ field }) => (
                <DropDown
                  {...field}
                  options={[
                    { value: "spoilage", label: "Spoilage" },
                    { value: "spillage", label: "Spillage" },
                    { value: "expiry", label: "Expiry" },
                    { value: "other", label: "Other" },
                  ]}
                  placeholder="Select type..."
                />
              )}
            />
            {errors.loss_type && (
              <p className="mt-1.5 text-xs text-destructive">
                {errors.loss_type.message}
              </p>
            )}
          </div>

          {/* Quantity Lost */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Quantity Lost ({ingredient.unit})
            </label>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              placeholder="0"
              error={errors.quantity_lost?.message}
              {...register("quantity_lost", { valueAsNumber: true })}
            />
          </div>

          {/* Estimated Cost */}
          {estimatedCost !== null && (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                Estimated cost:{" "}
                <span className="font-medium text-foreground">
                  ₱{estimatedCost.toFixed(2)}
                </span>{" "}
                ({qty.toLocaleString()} × {costSource})
              </p>
            </div>
          )}

          {/* Total Cost Override */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Total Cost (₱) — override
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder={estimatedCost?.toFixed(2) ?? "0.00"}
              error={errors.total_cost?.message}
              {...register("total_cost", { valueAsNumber: true })}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes
            </label>
            <Textarea
              placeholder="Any notes about this loss..."
              error={errors.notes?.message}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>
              {isLoading ? "Declaring..." : "Confirm Loss"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
