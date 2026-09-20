import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { countSchema } from "../ingredientValidation";

const REASONS = [
  { value: "spillage", label: "Spillage" },
  { value: "spoilage", label: "Spoilage" },
  { value: "found_stock", label: "Found stock" },
  { value: "other", label: "Other" },
];

/**
 * CountModal (BR-07)
 *
 * Record a physical stocktake count for an ingredient.
 * Shows the live system figure and a color-coded variance preview
 * before confirming. Reason is required.
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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(countSchema),
    defaultValues: {
      physical_quantity: "",
      reason: "spillage",
      notes: "",
    },
  });

  // Fresh form on every open (render-adjust pattern).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) reset({ physical_quantity: "", reason: "spillage", notes: "" });
  }

  const systemStock = Number(ingredient?.stock_quantity ?? 0);
  const rawPhysical = watch("physical_quantity");
  const physical = rawPhysical === "" || rawPhysical == null ? null : Number(rawPhysical);
  const variance = physical == null || Number.isNaN(physical)
    ? null
    : Math.round((physical - systemStock) * 1000) / 1000;

  const varianceTone =
    variance == null || variance === 0
      ? null
      : variance < 0 ? "short" : "over";

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
          onSubmit={handleSubmit((data) => onSubmit(data))}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Physical count ({ingredient.unit})
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
                  ? "Matches system stock — nothing to correct"
                  : varianceTone === "short"
                    ? `−${Math.abs(variance).toLocaleString()} ${ingredient.unit} short — will be recorded as loss`
                    : `+${variance.toLocaleString()} ${ingredient.unit} over — stock will increase`}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Reason <span className="font-normal text-muted-foreground">(required)</span>
            </label>
            <Controller
              name="reason"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => field.onChange(r.value)}
                      className={cn(
                        "cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors",
                        field.value === r.value
                          ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                          : "font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            />
            {errors.reason && (
              <p className="mt-1 text-xs text-destructive">{errors.reason.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              placeholder="Anything worth remembering about this count..."
              error={errors.notes?.message}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Recording..." : "Record count"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
