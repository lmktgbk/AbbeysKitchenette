import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useProductMutations, useProductDetail, useCategoryList } from "../query";
import { useIngredientList } from "@/features/ingredients/query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import KpiCards from "../components/KpiCards";
import ProductGrid from "../components/ProductGrid";
import ProductFormModal from "../components/ProductFormModal";
import ProductDetailModal from "../components/ProductDetailModal";

/**
 * ProductsPage
 *
 * Main orchestrator for the Products module.
 * Manages state and mutations only — all UI is delegated to child components.
 *
 * Layout:
 * - KpiCards (summary stats)
 * - ProductGrid (image-heavy card grid with search, sort, actions)
 * - ProductFormModal (create/edit with variants + recipes)
 * - Confirmations via ConfirmDialog (deactivate, delete)
 */
export default function ProductsPage() {
  const mutations = useProductMutations();

  // ── Modal state ─────────────────────
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // ── Detail modal state ──────────────
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailProductId, setDetailProductId] = useState(null);
  const { data: detailData, isLoading: isLoadingDetail } = useProductDetail(detailProductId, {
    enabled: !!detailProductId,
  });

  // ── Edit detail fetch (via query hook) ──
  const [editProductId, setEditProductId] = useState(null);
  const { data: editDetailData, isLoading: isLoadingEditDetail } = useProductDetail(editProductId, {
    enabled: !!editProductId,
  });

  // ── Categories & ingredients (via query hooks) ──
  const { data: categoriesData } = useCategoryList();
  const { data: ingredientsData } = useIngredientList({ limit: 9999 });

  const categories = categoriesData?.data?.categories ?? [];
  const ingredients = ingredientsData?.data?.ingredients ?? [];

  // When edit detail data arrives, update selectedProduct
  useEffect(() => {
    if (editDetailData?.data?.product) {
      setSelectedProduct(editDetailData.data.product);
    }
  }, [editDetailData]);

  // ── Detail modal product state ──────
  const [detailProduct, setDetailProduct] = useState(null);

  // When detail modal data arrives, update detailProduct
  useEffect(() => {
    if (detailData?.data?.product) {
      setDetailProduct(detailData.data.product);
    }
  }, [detailData]);

  // ── Mutations ───────────────────────

  const createMutation = {
    mutate: (data) =>
      mutations.create.mutate(data, {
        onSuccess: () => {
          toast.success("Product created");
          setShowFormModal(false);
        },
        onError: (err) =>
          toast.error(err.response?.data?.message || "Failed to create product"),
      }),
    isPending: mutations.create.isPending,
  };

  const updateMutation = {
    mutate: ({ id, data }) => {
      const { variants, ...productInfo } = data;
      mutations.update.mutate(
        { id, data: productInfo },
        {
          onSuccess: () => {
            mutations.updateVariants.mutate(
              { id, variants },
              {
                onSuccess: () => {
                  toast.success("Product updated");
                  setShowFormModal(false);
                  setSelectedProduct(null);
                  setIsEditMode(false);
                },
                onError: (err) =>
                  toast.error(err.response?.data?.message || "Failed to update variants"),
              },
            );
          },
          onError: (err) =>
            toast.error(err.response?.data?.message || "Failed to update product"),
        },
      );
    },
    isPending: mutations.update.isPending || mutations.updateVariants.isPending,
  };

  // ── Handlers ────────────────────────

  function handleAdd() {
    setSelectedProduct(null);
    setIsEditMode(false);
    setShowFormModal(true);
  }

  function handleViewDetail(product) {
    setDetailProduct(product); // list-level data (shows instantly)
    setShowDetailModal(true);
    setDetailProductId(product.product_id); // triggers useProductDetail
  }

  function handleEdit(product) {
    setSelectedProduct(product);   // list data (has product_id, product_name, etc.)
    setIsEditMode(true);
    setShowFormModal(true);        // opens instantly
    setEditProductId(product.product_id);  // triggers useProductDetail
  }

  async function handleDeactivate(product) {
    const ok = await confirm({
      title: "Deactivate Product?",
      message: `This will deactivate "${product.product_name}" and all its variants.`,
      note: "The product will be hidden from POS but can be reactivated later.",
      confirmLabel: "Deactivate",
      loadingText: "Deactivating...",
      variant: "danger",
      onConfirm: () => mutations.deactivate.mutateAsync(product.product_id),
    });
    if (ok) toast.success("Product deactivated");
  }

  async function handleActivate(product) {
    const ok = await confirm({
      title: "Activate Product?",
      message: `This will activate "${product.product_name}".`,
      confirmLabel: "Activate",
      loadingText: "Activating...",
      variant: "success",
      onConfirm: () => mutations.activate.mutateAsync(product.product_id),
    });
    if (ok) toast.success("Product activated");
  }

  async function handleDelete(product) {
    const ok = await confirm({
      title: "Delete Permanently?",
      message: `This will permanently delete "${product.product_name}" and all its variants and recipes.`,
      note: "This action cannot be undone.",
      confirmLabel: "Delete",
      loadingText: "Deleting...",
      variant: "danger",
      onConfirm: () => mutations.remove.mutateAsync(product.product_id),
    });
    if (ok) toast.success("Product deleted permanently");
  }

  function handleFormSubmit(data) {
    if (isEditMode && selectedProduct) {
      updateMutation.mutate({ id: selectedProduct.product_id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isFormLoading = createMutation.isPending || mutations.update.isPending || mutations.updateVariants.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Summary Cards */}
      <KpiCards />

      {/* Product Grid */}
      <ProductGrid
        onAdd={handleAdd}
        onViewDetail={handleViewDetail}
        categories={categories}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        open={showDetailModal}
        onOpenChange={(open) => {
          if (!open) {
            setDetailProduct(null);
            setDetailProductId(null);
          }
          setShowDetailModal(open);
        }}
        product={detailProduct}
        detail={detailData?.data?.product ?? null}
        loading={isLoadingDetail && !!detailProductId}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onDelete={handleDelete}
      />

      {/* Add/Edit Product Modal */}
      <ProductFormModal
        key={isEditMode && selectedProduct?.product_id ? selectedProduct.product_id : "add"}
        open={showFormModal}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
            setEditProductId(null);
          }
          setShowFormModal(open);
        }}
        product={selectedProduct}
        isEditMode={isEditMode}
        loading={isLoadingEditDetail}
        onSubmit={handleFormSubmit}
        isLoading={isFormLoading}
        categories={categories}
        ingredients={ingredients}
        onUploadImage={mutations.uploadImage.mutateAsync}
      />
    </div>
  );
}
