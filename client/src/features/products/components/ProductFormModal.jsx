import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import { DropDown } from "@/components/filters/DropDown";
import { createProductSchema, editProductSchema } from "../productValidation";
import VariantCard from "./VariantCard";
import ImageUpload from "./ImageUpload";
import CategoryModal from "./CategoryModal";

/**
 * ProductFormModal
 *
 * Add new product or edit existing one.
 * Single scrollable form with product info + variant cards (with recipe editors).
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - product: object | null
 * - isEditMode: boolean — explicit edit mode flag (modal opens before detail loads)
 * - loading: boolean — true while fetching product detail for edit
 * - onSubmit: (data) => void
 * - isLoading: boolean — true while create/update mutation is running
 * - categories: array of { category_id, category_name }
 * - ingredients: array of { ingredient_id, ingredient_name, unit }
 * - onUploadImage: (file) => Promise<{ data: { url: string } }>
 */
export default function ProductFormModal({
  open,
  onOpenChange,
  product,
  isEditMode = false,
  loading = false,
  onSubmit,
  isLoading,
  categories = [],
  ingredients = [],
  onUploadImage,
}) {
  const isEdit = isEditMode;
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEdit ? editProductSchema : createProductSchema),
    defaultValues: getDefaultValues(product, isEdit),
  });

  const { fields: variantFields, append: addVariant, remove: removeVariant } = useFieldArray({
    control,
    name: "variants",
  });

  // Reset form when product changes or modal opens/closes
  useEffect(() => {
    if (open) {
      reset(getDefaultValues(product, isEdit));
      setImageFile(null);
      setImagePreview(product?.image_url || null);
    }
  }, [open, isEdit, product, reset]);

  // Generate image preview when file changes
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [imageFile]);

  function handleClose() {
    reset();
    setImageFile(null);
    setImagePreview(null);
    onOpenChange(false);
  }

  async function handleFormSubmit(data) {
    let imageUrl = data.image_url || null;

    // Upload image if a new file was selected
    if (imageFile && onUploadImage) {
      try {
        const res = await onUploadImage(imageFile);
        imageUrl = res.data.url;
      } catch {
        // Image upload failed — continue without image
      }
    }

    // If image was removed
    if (!imageFile && !imagePreview && data.image_url) {
      imageUrl = null;
    }

    onSubmit({ ...data, image_url: imageUrl });
  }

  const categoryOptions = categories.map((c) => ({
    value: c.category_id,
    label: c.category_name,
  }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update product details and manage variants."
              : "Create a new product with variants and recipes."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <EditSkeleton />
        ) : (
          <form
            onSubmit={handleSubmit(handleFormSubmit)}
            className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1"
          >
            {/* ── Product Information ──────────── */}
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Product Information
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Product Name — left */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Product Name
                  </label>
                  <Input
                    placeholder="e.g. Caramel Latte"
                    error={errors.product_name?.message}
                    {...register("product_name")}
                  />
                </div>

                {/* Category — right */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-semibold text-foreground">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setCategoryModalOpen(true)}
                      className="flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      <Icon name="plus" size={12} />
                      Add
                    </button>
                  </div>
                  <Controller
                    name="category_id"
                    control={control}
                    render={({ field }) => (
                      <DropDown
                        {...field}
                        value={field.value || ""}
                        options={categoryOptions}
                        placeholder="Select category..."
                        onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                      />
                    )}
                  />
                  {errors.category_id && (
                    <p className="mt-1.5 text-xs text-destructive">
                      {errors.category_id.message}
                    </p>
                  )}
                </div>

                {/* Image — left */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Image
                  </label>
                  <ImageUpload
                    value={watch("image_url")}
                    onChange={(file) => {
                      if (file) {
                        setImageFile(file);
                        setImagePreview(URL.createObjectURL(file));
                      } else {
                        setImageFile(null);
                        setImagePreview(null);
                      }
                    }}
                    previewUrl={imagePreview}
                  />
                </div>

                {/* Description — right */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Description
                  </label>
                  <textarea
                    placeholder="Optional product description..."
                    rows={4}
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register("description")}
                  />
                </div>
              </div>
            </section>

            {/* ── Variants ─────────────────────── */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Variants {variantFields.length > 0 && `(${variantFields.length})`}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    addVariant({
                      size_name: "",
                      price: 0,
                      recipes: [],
                    })
                  }
                >
                  <Icon name="plus" size={14} className="mr-1" />
                  Add Variant
                </Button>
              </div>

              {errors.variants?.message && (
                <p className="mb-2 text-xs text-destructive">{errors.variants.message}</p>
              )}

              {variantFields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No variants yet. Click "Add Variant" to get started.
                  </p>
                </div>
              ) : (
                variantFields.map((field, idx) => (
                  <VariantCard
                    key={field.id}
                    control={control}
                    index={idx}
                    register={register}
                    errors={errors}
                    ingredients={ingredients}
                    isExisting={!!field.variant_id}
                    hasTransactions={!!field.has_transactions}
                    isStockSufficient={field.is_stock_sufficient ?? null}
                    canRemove={!field.has_transactions}
                    isLast={idx === variantFields.length - 1}
                    onRemove={() => removeVariant(idx)}
                  />
                ))
              )}
            </section>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save Changes"
                    : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>

      {/* Inline Category Create Modal */}
      <CategoryModal
        open={categoryModalOpen}
        onOpenChange={setCategoryModalOpen}
        standalone={false}
        onCreated={(newCat) => {
          // Auto-select the newly created category
          setValue("category_id", newCat.category_id, { shouldValidate: true });
        }}
      />
    </Dialog>
  );
}

/**
 * Skeleton shown while fetching product detail for edit mode.
 */
function EditSkeleton() {
  return (
    <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
      {/* Product Information skeleton */}
      <section>
        <Skeleton className="mb-3 h-4 w-36" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="col-span-2 h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </section>

      {/* Variant skeleton */}
      <section>
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="mt-2 h-20 w-full" />
      </section>

      {/* Footer skeleton */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

/**
 * Build default values for react-hook-form based on mode.
 */
function getDefaultValues(product, isEdit) {
  if (isEdit && product) {
    return {
      product_name: product.product_name || "",
      category_id: product.category_id || undefined,
      description: product.description || "",
      image_url: product.image_url || "",
      is_available: product.is_available,
      variants: (product.variants || []).map((v) => ({
        variant_id: v.variant_id,
        size_name: v.size_name,
        price: v.price,
        is_stock_sufficient: v.is_stock_sufficient ?? null,
        has_transactions: v.has_transactions,
        recipes: (v.recipes || []).map((r) => ({
          ingredient_id: r.ingredient_id,
          quantity_needed: r.quantity_needed,
        })),
      })),
    };
  }

  return {
    product_name: "",
    category_id: undefined,
    description: "",
    image_url: "",
    is_available: true,
    variants: [],
  };
}
