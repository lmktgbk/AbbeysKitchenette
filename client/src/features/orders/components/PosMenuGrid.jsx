import { useState } from "react";
import { useGuestMenu } from "../query";
import useAuthStore from "@/features/auth/authStore";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * PosMenuGrid — product selection grid for the POS.
 *
  * Cashiers only see Beverages (category_name filter).
 * All other roles see everything.
 */
export default function PosMenuGrid({ onAddItem }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const user = useAuthStore((s) => s.user);

  const { data: menuData, isPending, isFetching } = useGuestMenu({
    search: search || undefined,
  });

  const allProducts = menuData?.data?.menu ?? [];

  // Cashier → beverages only; others → all
  const isCashier = user?.role === "cashier";
  const visibleProducts = isCashier
    ? allProducts.filter((p) => !p.category_name || p.category_name === "Beverages")
    : allProducts;

  const categories = [
    { id: "all", name: "All" },
    ...Array.from(
      new Map(
        visibleProducts
          .filter((p) => p.category_name)
          .map((p) => [p.category_name, p.category_name])
      ).entries()
    ).map(([, name]) => ({ id: name, name })),
  ];

  const products = activeCategory === "all"
    ? visibleProducts
    : visibleProducts.filter((p) => p.category_name === activeCategory);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search menu..."
        className="h-10 w-full rounded-lg border border-border bg-card px-4 text-sm outline-none focus:border-primary"
      />

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="relative grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {isFetching && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {products.map((product) => (
          <ProductCard
            key={product.product_id}
            product={product}
            onAddItem={onAddItem}
          />
        ))}
      </div>

      {products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">No products available</p>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onAddItem }) {
  const [showVariants, setShowVariants] = useState(false);

  const variants = product.variants ?? [];
  const availableVariants = variants.filter((v) => v.is_available !== false);
  const unavailableCount = variants.length - availableVariants.length;

  const hasVariants = variants.length > 1;
  const singleVariant = variants.length === 1 ? variants[0] : null;
  const singleAvailable = singleVariant && singleVariant.is_available !== false;

  function handleQuickAdd() {
    if (singleAvailable) {
      onAddItem?.({
        product_id: product.product_id,
        variant_id: singleVariant.variant_id,
        product_name: product.product_name,
        size_name: singleVariant.size_name,
        quantity: 1,
        unit_price: singleVariant.price,
      });
    } else if (hasVariants || singleVariant) {
      setShowVariants(true);
    }
  }

  function handleVariantSelect(variant) {
    onAddItem?.({
      product_id: product.product_id,
      variant_id: variant.variant_id,
      product_name: product.product_name,
      size_name: variant.size_name,
      quantity: 1,
      unit_price: variant.price,
    });
    setShowVariants(false);
  }

  const isFullyUnavailable = availableVariants.length === 0;

  return (
    <>
      <div className={`relative overflow-hidden rounded-xl border border-border bg-card transition-colors ${
        isFullyUnavailable
          ? "opacity-50"
          : "hover:border-primary/50"
      }`}>
        <button
          type="button"
          onClick={handleQuickAdd}
          className={`flex w-full flex-col p-3 text-left ${isFullyUnavailable ? "cursor-not-allowed" : ""}`}
        >
          <p className="truncate text-sm font-semibold">{product.product_name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{product.category_name}</p>
          {singleVariant && (
            <p className={`mt-1 text-sm font-bold ${singleAvailable ? "text-primary" : "text-muted-foreground line-through"}`}>
              ₱{Number(singleVariant.price).toLocaleString()}
            </p>
          )}
          {hasVariants && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {availableVariants.length} size{availableVariants.length !== 1 ? "s" : ""} available
              {unavailableCount > 0 && (
                <span className="text-destructive"> · {unavailableCount} out of stock</span>
              )}
            </p>
          )}
          {!singleVariant && variants.length === 1 && (
            <p className="mt-1 text-[11px] text-destructive">Out of stock</p>
          )}
        </button>
      </div>

      {/* Variant selector modal */}
      <Dialog open={showVariants} onOpenChange={setShowVariants}>
        <DialogContent className="max-w-sm">
          <DialogClose onClick={() => setShowVariants(false)} />
          <DialogHeader>
            <DialogTitle>{product.product_name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Select size:</p>
          <div className="flex flex-col gap-2 mt-2">
            {variants.map((variant) => {
              const isAvailable = variant.is_available !== false;
              return (
                <button
                  key={variant.variant_id}
                  disabled={!isAvailable}
                  onClick={() => isAvailable && handleVariantSelect(variant)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isAvailable
                      ? "border-border hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                  }`}
                >
                  <span>{variant.size_name}</span>
                  <span>
                    ₱{Number(variant.price).toLocaleString()}
                    {!isAvailable && <span className="ml-1 text-xs">(Out of stock)</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
