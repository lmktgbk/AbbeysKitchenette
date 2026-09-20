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
import DatePicker from "@/components/filters/DatePicker";
import { restockSchema } from "../ingredientValidation";

/**
 * RestockModal
 *
 * Add stock to an ingredient via a new FIFO batch.
 * Shows live cost-per-unit calculation as the user types.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - ingredient: object (the ingredient being restocked)
 * - initialQuantity: number (optional — pre-fill quantity from AI suggestion)
 * - onSubmit: (data) => void
 * - isLoading: boolean
 */
export default function RestockModal({
  open,
  onOpenChange,
  ingredient,
  initialQuantity,
  onSubmit,
  isLoading,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      quantity_added: "",
      total_cost: "",
      supplier_name: "",
      notes: "",
    },
  });

  const quantityAdded = watch("quantity_added") || 0;
  const totalCost = watch("total_cost") || 0;
  const expiryDate = watch("expiry_date") || "";
  const costPerUnit =
    quantityAdded > 0 ? (totalCost / quantityAdded).toFixed(4) : "0.0000";

  // BR-05: live expiry hint (date-only compare, same math as the server)
  const expiryHint = (() => {
    if (!expiryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${expiryDate}T00:00:00`);
    if (isNaN(expiry.getTime())) return null;
    const days = Math.round((expiry - today) / 86400000);
    if (days < 0) return { tone: "red", text: "Already expired — will flag immediately" };
    if (days <= 7) return { tone: "amber", text: `Expires in ${days} day${days === 1 ? "" : "s"} — you'll be warned` };
    return null;
  })();

  useEffect(() => {
    if (open) {
      reset({
      quantity_added: initialQuantity || "",
      total_cost: "",
        supplier_name: "",
        expiry_date: "",
        notes: initialQuantity ? `Restock per AI suggestion` : "",
      });
    }
  }, [open, reset, initialQuantity]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleFormSubmit(data) {
    // Compute cost_per_unit from total_cost / quantity_added
    const costPerUnit = data.total_cost / data.quantity_added;
    const { total_cost, ...rest } = data;
    onSubmit({ ...rest, cost_per_unit: costPerUnit });
  }

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>Restock Ingredient</DialogTitle>
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
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Ingredient
            </label>
            <div className="flex h-10 w-full items-center rounded-lg border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
              {ingredient.ingredient_name}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Quantity Added ({ingredient.unit})
            </label>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              placeholder="0"
              error={errors.quantity_added?.message}
              {...register("quantity_added", { valueAsNumber: true })}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Total Cost (₱)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              error={errors.total_cost?.message}
              {...register("total_cost", { valueAsNumber: true })}
            />
            {quantityAdded > 0 && totalCost > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                ₱{totalCost.toLocaleString()} ÷ {quantityAdded.toLocaleString()} {ingredient.unit} = ₱{costPerUnit} / {ingredient.unit}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Supplier Name
            </label>
            <Input
              placeholder="e.g. Fresh Farms Inc."
              error={errors.supplier_name?.message}
              {...register("supplier_name")}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Expiry Date <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Controller
              name="expiry_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="No expiry date"
                />
              )}
            />
            {errors.expiry_date && (
              <p className="mt-1 text-xs text-destructive">{errors.expiry_date.message}</p>
            )}
            {expiryHint && (
              <p className={`mt-1 text-xs ${expiryHint.tone === "red" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                {expiryHint.text}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes
            </label>
            <Textarea
              placeholder="Any notes about this restock..."
              error={errors.notes?.message}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Recording..." : "Record Restock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
