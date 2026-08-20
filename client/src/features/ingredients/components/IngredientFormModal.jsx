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
import { DropDown } from "@/components/filters/DropDown";
import {
  createIngredientSchema,
  editIngredientSchema,
  UNIT_OPTIONS,
} from "../ingredientValidation";

/**
 * IngredientFormModal
 *
 * Add new ingredient or edit existing one.
 * Uses react-hook-form + Zod validation.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - ingredient: object | null (null = add mode, object = edit mode)
 * - onSubmit: (data) => void
 * - isLoading: boolean
 */
export default function IngredientFormModal({
  open,
  onOpenChange,
  ingredient,
  onSubmit,
  isLoading,
}) {
  const isEdit = !!ingredient;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEdit ? editIngredientSchema : createIngredientSchema),
    defaultValues: isEdit
      ? {
        ingredient_name: ingredient.ingredient_name,
        unit: ingredient.unit,
        minimum_threshold: ingredient.minimum_threshold,
      }
      : {
        ingredient_name: "",
        unit: "",
        minimum_threshold: 0,
      },
  });

  // Reset form when ingredient changes or modal opens/closes
  useEffect(() => {
    if (open) {
      if (isEdit) {
        reset({
          ingredient_name: ingredient.ingredient_name,
          unit: ingredient.unit,
          minimum_threshold: ingredient.minimum_threshold,
        });
      } else {
        reset({
          ingredient_name: "",
          unit: "",
          minimum_threshold: 0,
        });
      }
    }
  }, [open, isEdit, ingredient, reset]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleFormSubmit(data) {
    onSubmit(data);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the ingredient details below."
              : "Add a new ingredient to track in your inventory."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Ingredient Name
            </label>
            <Input
              placeholder="e.g. Oat Milk"
              error={errors.ingredient_name?.message}
              {...register("ingredient_name")}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Unit
            </label>
            <Controller
              name="unit"
              control={control}
              render={({ field }) => (
                <DropDown
                  {...field}
                  options={UNIT_OPTIONS}
                  placeholder="Select unit..."
                  disabled={isEdit}
                />
              )}
            />
            {errors.unit && (
              <p className="mt-1.5 text-xs text-destructive">{errors.unit.message}</p>
            )}
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">Unit cannot be changed after creation.</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Minimum Threshold
            </label>
            <Input
              type="number"
              step="0.001"
              min="0"
              placeholder="0"
              error={errors.minimum_threshold?.message}
              {...register("minimum_threshold", { valueAsNumber: true })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isEdit
                  ? "Saving..."
                  : "Adding..."
                : isEdit
                  ? "Save Changes"
                  : "Add Ingredient"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
