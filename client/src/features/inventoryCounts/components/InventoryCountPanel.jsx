import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useActiveCount, useStartCount, useSubmitCount } from "../query";
import { useIngredientList } from "@/features/ingredients/query";
import { toast } from "sonner";

/**
 * InventoryCountPanel — start and complete inventory counts.
 * Shows system vs actual quantities, tracks variances.
 */
export default function InventoryCountPanel() {
  const { data: activeCount, isLoading: activeLoading } = useActiveCount();
  const startCountMutation = useStartCount();
  const submitCountMutation = useSubmitCount();
  const { data: ingredientsData } = useIngredientList({ limit: 200, sortBy: "ingredient_name", sortDir: "asc" });

  const [countItems, setCountItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const ingredients = ingredientsData?.data?.ingredients || [];
  const filteredIngredients = ingredients.filter((ing) =>
    ing.ingredient_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleStartCount() {
    startCountMutation.mutate(
      { notes: "Weekly inventory count" },
      {
        onSuccess: () => {
          toast.success("Inventory count started");
          // Initialize count items with all ingredients at 0
          const items = ingredients.map((ing) => ({
            ingredient_id: ing.ingredient_id,
            ingredient_name: ing.ingredient_name,
            unit: ing.unit,
            system_quantity: ing.stock_quantity || 0,
            actual_quantity: 0,
            variance: 0,
            notes: "",
          }));
          setCountItems(items);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to start count"),
      }
    );
  }

  function handleUpdateActual(ingredientId, value) {
    setCountItems((prev) =>
      prev.map((item) => {
        if (item.ingredient_id === ingredientId) {
          const actual = Number(value) || 0;
          return { ...item, actual_quantity: actual, variance: actual - item.system_quantity };
        }
        return item;
      })
    );
  }

  function handleSubmitCount() {
    if (!activeCount) return;
    const items = countItems
      .filter((item) => item.actual_quantity !== 0 || item.variance !== 0)
      .map((item) => ({
        ingredient_id: item.ingredient_id,
        actual_quantity: item.actual_quantity,
        notes: item.notes || undefined,
      }));

    if (items.length === 0) {
      toast.error("No items to submit");
      return;
    }

    submitCountMutation.mutate(
      { id: activeCount.inventory_count_id || activeCount.inventoryCountId, data: { items } },
      {
        onSuccess: () => {
          toast.success("Inventory count submitted");
          setCountItems([]);
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to submit count"),
      }
    );
  }

  if (activeLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="loader-2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeCount && countItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Icon name="clipboard-list" size={48} className="text-muted-foreground/30" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">No Active Count</h3>
          <p className="text-sm text-muted-foreground">Start a weekly inventory count to compare system vs actual stock.</p>
        </div>
        <Button onClick={handleStartCount} disabled={startCountMutation.isPending}>
          <Icon name="plus" size={16} className="mr-2" />
          {startCountMutation.isPending ? "Starting..." : "Start Count"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Active Count</h3>
          <p className="text-xs text-muted-foreground">
            Started {activeCount?.started_at ? new Date(activeCount.startedAt).toLocaleString() : "just now"}
          </p>
        </div>
        <Button
          size="sm"
          disabled={submitCountMutation.isPending}
          onClick={handleSubmitCount}
        >
          {submitCountMutation.isPending ? "Submitting..." : "Submit Count"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search ingredients..."
          className="h-9 pl-8"
        />
      </div>

      {/* Count Items */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 font-medium text-muted-foreground">Ingredient</th>
              <th className="py-2 text-right font-medium text-muted-foreground">System</th>
              <th className="py-2 text-right font-medium text-muted-foreground">Actual</th>
              <th className="py-2 text-right font-medium text-muted-foreground">Variance</th>
            </tr>
          </thead>
          <tbody>
            {(searchTerm ? filteredIngredients : countItems).map((item) => {
              const countItem = countItems.find((ci) => ci.ingredient_id === (item.ingredient_id || item.ingredientId));
              const systemQty = countItem?.system_quantity || item.stock_quantity || 0;
              const actualQty = countItem?.actual_quantity || 0;
              const variance = countItem?.variance || 0;

              return (
                <tr key={item.ingredient_id || item.ingredientId} className="border-b border-border/50">
                  <td className="py-2">
                    <div className="font-medium">{item.ingredient_name || item.ingredientName}</div>
                    <div className="text-xs text-muted-foreground">{item.unit}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{systemQty.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={actualQty}
                      onChange={(e) => handleUpdateActual(item.ingredient_id || item.ingredientId, e.target.value)}
                      className="h-8 w-24 text-right text-sm"
                    />
                  </td>
                  <td className={`py-2 text-right tabular-nums font-medium ${variance > 0 ? "text-green-600" : variance < 0 ? "text-red-600" : ""}`}>
                    {variance > 0 ? "+" : ""}{variance.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
