import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { SearchableDropDown } from "@/components/filters/SearchableDropDown";
import { useCreateComboProduct } from "../query";
import { useCategoryList } from "@/features/products/query";
import { createComboSchema } from "../comboValidation";

/**
 * CreateComboModal
 *
 * Modal form for creating a combo product from two associated variants.
 * Uses react-hook-form + Zod for inline field validation.
 */
export default function CreateComboModal({ open, onOpenChange, combo }) {
  const createMutation = useCreateComboProduct();
  const { data: categoriesData } = useCategoryList();
  const categories = categoriesData?.data?.categories || [];
  const categoryOptions = categories.map((c) => ({
    value: String(c.category_id),
    label: c.category_name,
  }));

  const variantA = combo ? `${combo.product_a} ${combo.size_name_a || ""}`.trim() : "";
  const variantB = combo ? `${combo.product_b} ${combo.size_name_b || ""}`.trim() : "";
  const [ingredients, setIngredients] = useState(combo?.merged_ingredients || []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createComboSchema),
    defaultValues: {
      name: combo?.suggested_name || "",
      categoryId: "",
      description: `A fusion of ${variantA} and ${variantB}`,
      price: combo?.pricing?.suggested_price || 0,
    },
  });

  const price = watch("price");

  // Sync category value from SearchableDropDown
  const categoryId = watch("categoryId");
  function handleCategoryChange(value) {
    setValue("categoryId", value, { shouldValidate: true });
  }

  const totalCost = useMemo(
    () => ingredients.reduce((sum, ing) => sum + ing.line_cost, 0),
    [ingredients],
  );
  const margin = useMemo(
    () => (price > 0 ? ((1 - totalCost / price) * 100).toFixed(1) : "0"),
    [price, totalCost],
  );

  function handleIngredientChange(index, field, value) {
    setIngredients((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].line_cost = parseFloat(
        (updated[index].quantity_needed * updated[index].cost_per_unit).toFixed(2),
      );
      return updated;
    });
  }

  function handleRemoveIngredient(index) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(data) {
    const payload = {
      product_name: data.name.trim(),
      category_id: Number(data.categoryId),
      description: data.description.trim(),
      variants: [
        {
          size_name: combo?.size_name_a || "Regular",
          price: data.price,
          recipes: ingredients.map((ing) => ({
            ingredient_id: ing.ingredient_id,
            quantity_needed: ing.quantity_needed,
          })),
        },
      ],
      _comboPair: {
        product_name_a: combo.product_a,
        product_name_b: combo.product_b,
      },
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(`"${data.name}" created successfully`);
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(err.response?.data?.message || "Failed to create product");
      },
    });
  }

  function handleClose() {
    onOpenChange(false);
  }

  if (!combo) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="shoppingBag" size={18} className="text-primary" />
            Create Combo Product
          </DialogTitle>
          <DialogDescription>
            Combining {variantA} + {variantB}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Category
            </label>
            <SearchableDropDown
              options={categoryOptions}
              value={categoryId}
              onChange={handleCategoryChange}
              placeholder="Select category..."
              searchPlaceholder="Search categories..."
            />
            {errors.categoryId && (
              <p className="mt-1.5 text-xs text-destructive">{errors.categoryId.message}</p>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Product Name
            </label>
            <Input
              error={errors.name?.message}
              placeholder="e.g., Lemon Coffee Fusion"
              {...register("name")}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Description
            </label>
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              placeholder="Describe the combo..."
              {...register("description")}
            />
            {errors.description && (
              <p className="mt-1.5 text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Price per cup
            </label>
            <Input
              type="number"
              min={0}
              step={5}
              error={errors.price?.message}
              {...register("price", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Suggested: ₱{combo.pricing?.suggested_price} (15% off ₱{combo.pricing?.total_price} total, min margin 30%)
            </p>
          </div>

          {/* Cost Analysis */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingredient cost:</span>
              <span className="text-foreground">₱{totalCost.toFixed(2)}/cup</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin:</span>
              <span className="text-foreground">{margin}%</span>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">
              Ingredients
            </label>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div
                  key={ing.ingredient_id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {ing.ingredient_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ₱{ing.cost_per_unit}/{ing.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      className="h-7 w-20 text-xs"
                      value={ing.quantity_needed}
                      onChange={(e) =>
                        handleIngredientChange(idx, "quantity_needed", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="w-8 text-xs text-muted-foreground">{ing.unit}</span>
                  </div>
                  <span className="w-16 text-right text-xs text-foreground">
                    ₱{ing.line_cost.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveIngredient(idx)}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Icon name="loader" size={14} className="mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Product"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
