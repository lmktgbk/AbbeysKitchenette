import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

/**
 * LossModal
 *
 * Declare a loss for an ingredient (spoilage, spillage, expiry, other).
 * Shows estimated cost based on average cost per unit.
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
      quantity_lost: 0,
      notes: "",
    },
  });

  const quantityLost = watch("quantity_lost") || 0;
  const avgCost = ingredient?.current_avg_cost || 0;
  const estimatedCost = (quantityLost * avgCost).toFixed(2);

  useEffect(() => {
    if (open) {
      reset({
        loss_type: "",
        quantity_lost: 0,
        notes: "",
      });
    }
  }, [open, reset]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleFormSubmit(data) {
    onSubmit(data);
  }

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Loss Type *
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Quantity Lost * ({ingredient.unit})
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

          {quantityLost > 0 && (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                Estimated cost:{" "}
                <span className="font-medium text-foreground">
                  ₱{estimatedCost}
                </span>{" "}
                ({quantityLost.toLocaleString()} × ₱{avgCost.toFixed(4)})
              </p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
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
