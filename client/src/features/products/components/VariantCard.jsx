import { useState } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { SearchableDropDown } from "@/components/filters/SearchableDropDown";

/**
 * VariantCard
 *
 * A single variant card inside the product form.
 * Shows size name (editable unless locked), price, computed stock status, and collapsible recipe editor.
 * Variant availability is auto-computed from ingredient stock — no manual toggle.
 *
 * Props:
 * - control: react-hook-form control
 * - index: variant array index
 * - register: react-hook-form register
 * - errors: form errors
 * - ingredients: available ingredients list
 * - isExisting: boolean — true if editing an existing variant
 * - hasTransactions: boolean — true if variant has orders (locks size_name)
 * - isStockSufficient: boolean | null — computed stock status (null for new variants)
 * - onRemove: callback to remove this variant
 * - canRemove: boolean — false if variant has transactions
 * - isLast: boolean — for styling
 */
export default function VariantCard({
  control,
  index,
  register,
  errors,
  ingredients = [],
  isExisting = false,
  hasTransactions = false,
  isStockSufficient = null,
  onRemove,
  canRemove = true,
  isLast = false,
}) {
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);

  const sizeName = useWatch({ control, name: `variants.${index}.size_name` });

  const { fields, append, remove } = useFieldArray({
    control,
    name: `variants.${index}.recipes`,
  });

  const ingredientOptions = ingredients.map((i) => ({
    value: i.ingredient_id,
    label: `${i.ingredient_name} (${i.unit})`,
  }));

  const variantErrors = errors?.variants?.[index];

  return (
    <div className={`rounded-lg border border-border bg-card ${!isLast ? "mb-3" : ""}`}>
      {/* Variant header */}
      <div className="flex items-start gap-3 p-3">
        {/* Size name — editable unless locked by transactions */}
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Size
          </label>
          {isExisting && hasTransactions ? (
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">
                {sizeName || "—"}
              </p>
              <Icon
                name="lock"
                size={12}
                className="text-muted-foreground"
                title="Cannot rename — has existing orders"
              />
            </div>
          ) : (
            <Input
              placeholder="e.g. Large"
              error={variantErrors?.size_name?.message}
              {...register(`variants.${index}.size_name`)}
            />
          )}
        </div>

        {/* Price */}
        <div className="w-28">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Price
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            error={variantErrors?.price?.message}
            {...register(`variants.${index}.price`, { valueAsNumber: true })}
          />
        </div>

        {/* Computed stock status indicator (read-only) */}
        {isExisting && (
          <div className="flex items-end pb-0.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-md border ${isStockSufficient
                ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30"
                : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30"
                }`}
              title={isStockSufficient ? "Ingredients in stock" : "Insufficient ingredients"}
            >
              <span
                className={`h-2 w-2 rounded-full ${isStockSufficient ? "bg-green-500" : "bg-red-500"
                  }`}
              />
            </div>
          </div>
        )}

        {/* Remove variant button */}
        {onRemove && (
          <div className="flex items-end pb-0.5">
            <button
              type="button"
              onClick={onRemove}
              disabled={!canRemove}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              title={canRemove ? "Remove variant" : "Cannot remove — has transactions"}
            >
              <Icon name="trash2" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Recipe section — collapsible */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setIsRecipeOpen(!isRecipeOpen)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Icon
            name={isRecipeOpen ? "chevronDown" : "chevronRight"}
            size={14}
          />
          Recipe ({fields.length} ingredient{fields.length !== 1 ? "s" : ""})
        </button>

        {variantErrors?.recipes?.message && (
          <p className="px-3 pb-1 text-xs text-destructive">
            {variantErrors.recipes.message}
          </p>
        )}

        {isRecipeOpen && (
          <div className="space-y-2 px-3 pb-3">
            {fields.map((field, rIdx) => (
              <div key={field.id} className="flex items-center gap-2">
                {/* Ingredient searchable dropdown */}
                <div className="flex-1">
                  <Controller
                    name={`variants.${index}.recipes.${rIdx}.ingredient_id`}
                    control={control}
                    render={({ field: f }) => (
                      <SearchableDropDown
                        {...f}
                        options={ingredientOptions}
                        placeholder="Select ingredient..."
                        searchPlaceholder="Search ingredients..."
                      />
                    )}
                  />
                </div>

                {/* Quantity */}
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="Qty"
                    {...control.register(
                      `variants.${index}.recipes.${rIdx}.quantity_needed`,
                      { valueAsNumber: true },
                    )}
                  />
                </div>

                {/* Remove ingredient */}
                <button
                  type="button"
                  onClick={() => remove(rIdx)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}

            {/* Add ingredient button */}
            <Button
              type="button"
              variant={fields.length === 0 ? "default" : "ghost"}
              size="sm"
              onClick={() =>
                append({ ingredient_id: "", quantity_needed: "" })
              }
              className="w-full"
            >
              <Icon name="plus" size={14} className="mr-1" />
              Add Ingredient
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
