import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { cn } from "@/lib/utils";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { countSchema } from "../ingredientValidation";

/**
 * CountModal (BR-07)
 *
 * Record a physical stocktake count for an ingredient.
 * Shows the live system figure and a color-coded variance preview
 * before confirming. Changed quantities require an explanation.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - ingredient: object (needs ingredient_name, unit, stock_quantity)
 * - onSubmit: (data) => void
 * - isLoading: boolean
 */
export default function CountModal({
  open,
  onOpenChange,
  ingredient,
  onSubmit,
  isLoading,
}) {
  const [prevOpen, setPrevOpen] = useState(open);


  const systemStock = Number(ingredient?.stock_quantity ?? 0);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(countSchema.superRefine((data, ctx) => {
      if (Math.round((data.physical_quantity - systemStock) * 1000) !== 0 && !data.notes) {
        ctx.addIssue({ code: "custom", path: ["notes"], message: "Explain why this count differs from recorded stock" });
      }
    })),
    defaultValues: {
      physical_quantity: "",
      reason: "correction",
      notes: "",
    },
  });

  // Fresh form on every open (render-adjust pattern).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) reset({ physical_quantity: "", reason: "correction", notes: "" });
  }

  // Snapshot-based display only; the server compares the submitted physical count to current stock.
  const rawPhysical = useWatch({ control, name: "physical_quantity" });
  const physical = rawPhysical === "" || rawPhysical == null ? null : Number(rawPhysical);
  const variance = physical == null || Number.isNaN(physical)
    ? null
    : Math.round((physical - systemStock) * 1000) / 1000;

  const varianceTone =
    variance == null || variance === 0
      ? null
      : variance < 0 ? "short" : "over";

  /** Clears the physical-count draft before returning control to the inventory page. */
  function handleClose() {
    reset();
    onOpenChange(false);
  }

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>Record count</DialogTitle>
          <DialogDescription>
            {ingredient.ingredient_name} — System: {systemStock.toLocaleString()} {ingredient.unit}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async data => {
            // Confirmation explains the actual ledger effect; cancellation leaves the draft intact.
            const difference = Math.round((data.physical_quantity - systemStock) * 1000) / 1000;
            const note = difference > 0 ? "The increase fills non-expired batches oldest first, up to their original received quantities. If capacity is insufficient, nothing is saved. Use Restock for purchases."
              : difference < 0 ? "This corrects recorded stock without creating a loss or waste expense."
              : "This saves the stocktake and notes without changing quantities.";
            if (await confirm({ title: "Record this stock count?", message: `${ingredient.ingredient_name}: ${systemStock.toLocaleString()} → ${data.physical_quantity.toLocaleString()} ${ingredient.unit}`, note, confirmLabel: "Record count", variant: "warning" })) onSubmit(data);
          })}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Actual stock counted ({ingredient.unit})
            </label>
            <Input
              type="number"
              step="0.001"
              min="0"
              placeholder="0"
              autoFocus
              error={errors.physical_quantity?.message}
              {...register("physical_quantity", { valueAsNumber: true })}
            />
            {variance != null && (
              <p className={cn(
                "mt-1 text-xs font-medium",
                variance === 0 && "text-green-600 dark:text-green-400",
                varianceTone === "short" && "text-destructive",
                varianceTone === "over" && "text-green-600 dark:text-green-400",
              )}>
                {variance === 0
                  ? "Matches system stock — stocktake will be saved"
                  : varianceTone === "short"
                    ? `−${Math.abs(variance).toLocaleString()} ${ingredient.unit} short — record correction`
                    : `+${variance.toLocaleString()} ${ingredient.unit} over — stock will increase`}
              </p>
            )}
          </div>

          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Count corrects recorded stock. For spoiled, spilled, expired or missing stock, use Record loss. For purchases, use Restock.
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Explanation <span className="font-normal text-muted-foreground">{variance != null && variance !== 0 ? "(required)" : "(optional)"}</span>
            </label>
            <Textarea
              placeholder="Explain the stock record correction..."
              error={errors.notes?.message}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isSubmitting}>
              {isLoading ? "Recording..." : "Record count"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
