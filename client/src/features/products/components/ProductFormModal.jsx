import { useEffect, useId } from "react";
import { useResettableState } from "@/hooks/useResettableState";
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
 * - categories: array of { category_id, category_name, subcategories: [{ subcategory_id, subcategory_name }] }
 * - ingredients: array of { ingredient_id, ingredient_name, unit }
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
  ingredientsLoading = false,
  ingredientsError = false,
  onRetryIngredients,
}) {
  // Explicit edit mode prevents a create schema from being selected while detail data is loading.
  const isEdit = isEditMode;
  // The selected file is upload intent; the preview is a browser URL or the saved remote URL.
  const [imageFile, setImageFile] = useResettableState(null, [open, isEdit, product]);
  const [imagePreview, setImagePreview] = useResettableState(product?.image_url || null, [open, isEdit, product]);
  const imageGuidelinesId = useId();
  const [imageProcessing, setImageProcessing] = useResettableState(false, [open, isEdit, product]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEdit ? editProductSchema : createProductSchema),
    defaultValues: getDefaultValues(product, isEdit),
  });

  const { fields: variantFields, append: addVariant, remove: removeVariant } = useFieldArray({
    control,
    name: "variants",
  });

  // Reload saved values when the dialog opens or fetched product identity changes.
  useEffect(() => {
    if (open) {
      reset(getDefaultValues(product, isEdit));
    }
  }, [open, isEdit, product, reset]);

  // A preview belongs to this draft; release its browser allocation on replacement.
  useEffect(() => () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  /** Discards the form and image draft; the preview effect releases any local blob URL. */
  function handleClose() {
    reset();
    setImageFile(null);
    setImagePreview(null);
    onOpenChange(false);
  }

  /** Sends metadata and file intent together; remote asset replacement/cleanup belongs to the API. */
  async function handleFormSubmit(data) {
    // Enter-key submissions must also wait for the replacement image bytes.
    if (imageProcessing || ingredientsLoading || ingredientsError) return;
    let imageUrl = data.image_url || null;

    // An explicit removal clears the saved URL; choosing a replacement instead sends its file.
    if (!imageFile && !imagePreview && data.image_url) {
      imageUrl = null;
    }

    onSubmit({ ...data, image_url: imageUrl, image_file: imageFile });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-full sm:max-w-3xl">
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
            {ingredientsLoading && (
              <p role="status" className="text-sm text-muted-foreground">Loading recipe ingredients...</p>
            )}
            {ingredientsError && (
              <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
                <span>Recipe ingredients could not be loaded.</span>
                <Button type="button" variant="outline" onClick={onRetryIngredients}>Retry ingredients</Button>
              </div>
            )}
            {/* ── Product Information ──────────── */}
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Product Information
              </h3>

              {/* Independent columns keep the image and its compact guidance beside
                  the text fields without creating extra full-width grid rows. */}
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0 space-y-4">
                  {/* Product Name */}
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

                  {/* Category */}
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Category
                    </label>
                    <Controller
                      name="subcategory_id"
                      control={control}
                      render={({ field }) => (
                        <DropDown
                          value={field.value ? String(field.value) : ""}
                          onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                          placeholder="Select category..."
                          options={categories.flatMap((cat) =>
                            (cat.subcategories || []).map((sub) => ({
                              value: String(sub.subcategory_id),
                              label: sub.subcategory_name,
                            }))
                          )}
                        />
                      )}
                    />
                    {errors.subcategory_id && (
                      <p className="mt-1.5 text-xs text-destructive">
                        {errors.subcategory_id.message}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Description
                    </label>
                    <textarea
                      placeholder="Optional product description..."
                      rows={3}
                      className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                      {...register("description")}
                    />
                  </div>

                </div>

                {/* Image */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Image
                  </label>
                  <ImageUpload
                    onChange={(file) => {
                      setImageFile(file);
                      setImagePreview(file ? URL.createObjectURL(file) : null);
                    }}
                    previewUrl={imagePreview}
                    describedBy={imageGuidelinesId}
                    onProcessingChange={setImageProcessing}
                  />
                  {/* Let expanded guidance grow naturally rather than clipping it
                      to the description's height or introducing another scrollbar. */}
                  <aside id={imageGuidelinesId} aria-label="Image guidelines"
                    className="mt-2 max-w-[180px] space-y-0.5 rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground sm:text-[10px] sm:leading-3">
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <Icon name="info" size={12} className="shrink-0" /> Image guidelines
                    </p>
                    <p>JPG, PNG, WebP, GIF · Max 5 MB</p>
                    <p>Recommended: square 1000 × 1000 px</p>
                    <details>
                      <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary">More details</summary>
                      <p className="mt-1">Static images are resized automatically to fit 1000 pixels per side, preserving proportions. Source limit: 8192 pixels per side and 32 megapixels. Animated images are preserved and must fit the server's 4096-pixel and frame limits. Product cards crop the display only.</p>
                    </details>
                  </aside>
                </div>
              </div>
            </section>

            {/* ── Variants ─────────────────────── */}
            <section className="border-t border-border pt-4">
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
                      price: "",
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
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || imageProcessing || ingredientsLoading || ingredientsError}>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full sm:col-span-2" />
          <Skeleton className="h-28 w-full sm:col-span-2" />
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
 * Maps fetched variants and recipes to editable fields while retaining IDs and history locks.
 * Creation uses empty variants; a loading edit never invents saved recipe or stock data.
 */
function getDefaultValues(product, isEdit) {
  if (isEdit && product) {
    return {
      product_name: product.product_name || "",
      subcategory_id: product.subcategory_id || undefined,
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
    subcategory_id: undefined,
    description: "",
    image_url: "",
    is_available: true,
    variants: [],
  };
}
