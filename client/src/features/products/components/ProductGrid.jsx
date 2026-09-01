import { useState, useEffect } from "react";
import { useProductList } from "../query";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { SearchBar } from "@/components/filters/SearchBar";
import { FilterPill } from "@/components/filters/FilterPill";
import { Pagination } from "@/components/filters/Pagination";
import FilterModal from "@/components/filters/FilterModal";
import { Skeleton } from "@/components/ui/skeleton";
import ProductCard from "./ProductCard";
import CategoryModal from "./CategoryModal";

const SORT_OPTIONS = [
  { value: "created_at_desc", label: "Newest First" },
  { value: "created_at_asc", label: "Oldest First" },
  { value: "product_name_asc", label: "Name A–Z" },
  { value: "product_name_desc", label: "Name Z–A" },
  { value: "category_name_asc", label: "Category A–Z" },
  { value: "category_name_desc", label: "Category Z–A" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "unavailable", label: "Unavailable" },
];

/**
 * ProductGrid
 *
 * Responsive card grid for products.
 * Self-fetching — manages its own query params, search, sort, and pagination.
 *
 * Props:
 * - onAdd: callback to open add product modal
 * - onViewDetail: callback to open product detail modal
 * - onOptimizePrice: callback to open price optimization modal
 * - categories: array of { category_id, category_name }
 */
export default function ProductGrid({
  onAdd,
  onViewDetail,
  onOptimizePrice,
  categories = [],
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeSort, setActiveSort] = useState("created_at_desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ category: "all" });
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Reset page when search, sort, or status changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeSort, statusFilter, activeFilters.category]);

  // Parse compound sort string: "created_at_desc" → sortBy + sortDir
  const [sortBy, sortDir] = activeSort.includes("_desc")
    ? [activeSort.replace(/_desc$/, ""), "desc"]
    : [activeSort.replace(/_asc$/, ""), "asc"];

  const filterActive =
    activeFilters.category !== "all" || statusFilter !== "all";

  const queryParams = {
    page: currentPage,
    limit: pageSize,
    search: search || undefined,
    category: activeFilters.category !== "all" ? activeFilters.category : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    sortBy,
    sortDir,
  };

  const { data, isLoading, isRefetching } = useProductList(queryParams);
  const products = data?.data?.products ?? [];
  const totalItems = data?.data?.totalItems ?? 0;

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    ...categories.map((c) => ({ value: String(c.category_id), label: c.category_name })),
  ];

  const filterOptions = [
    { key: "category", label: "Category", options: categoryOptions },
  ];

  function handleFilterApply(sort, filters) {
    setActiveSort(sort);
    setActiveFilters(filters);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Toolbar — aligned with ingredients pattern */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Search + Filter icon */}
        <div className="flex items-center gap-2">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search products..."
            onFilterClick={() => setFilterOpen(true)}
            filterActive={filterActive}
          />
        </div>

        {/* Right: Status pill + Manage Categories + Add */}
        <div className="flex items-center gap-2">
          <FilterPill
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCategoryOpen(true)}
          >
            <Icon name="tag" size={14} className="mr-1" />
            <span className="hidden sm:inline">Manage Categories</span>
          </Button>
          <Button size="sm" onClick={onAdd}>
            <Icon name="plus" size={14} className="mr-1" />
            <span className="hidden sm:inline">Add Product</span>
          </Button>
        </div>
      </div>

      {/* Sort & Filter Modal */}
      <FilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        sortOptions={SORT_OPTIONS}
        filterOptions={filterOptions}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />

      {/* Grid */}
      <div className="relative p-4">
        {isRefetching && (
          <div className="absolute inset-0 z-10 bg-card/60" />
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Icon name="package" size={48} className="mb-4 text-muted-foreground/30" />
            <p className="mb-1 text-sm font-medium text-foreground">
              {search ? "No products match your search." : "No products yet"}
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              {search
                ? "Try a different search term."
                : "Add your first product to get started."}
            </p>
            {!search && (
              <Button size="sm" onClick={onAdd}>
                <Icon name="plus" size={14} className="mr-1" />
                Add Product
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.product_id}
                product={product}
                onViewDetail={onViewDetail}
                onOptimizePrice={onOptimizePrice}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="border-t border-border px-4 py-3">
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="products"
          />
        </div>
      )}

      {/* Category Management Modal */}
      <CategoryModal open={categoryOpen} onOpenChange={setCategoryOpen} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}
