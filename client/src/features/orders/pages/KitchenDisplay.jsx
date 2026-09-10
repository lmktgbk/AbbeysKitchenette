import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useKitchenDisplay, useKitchenBatchGroups, useOrderMutations } from "../query";
import useAuthStore from "@/features/auth/authStore";
import KitchenHeader from "../components/KitchenHeader";
import OrderCard from "../components/OrderCard";
import BatchSidebar from "../components/BatchSidebar";
import ConfirmReadyModal from "../components/ConfirmReadyModal";
import PrimarySpinner from "@/components/ui/spinner";
import Icon from "@/components/ui/icon";

const TABS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "completed", label: "Completed" },
];

export default function KitchenDisplay() {
  const {
    loading,
    refreshing,
    preparing,
    accepted,
    completedToday,
    markReady,
    markingReady,
  } = useKitchenDisplay();

  const { data: batchData } = useKitchenBatchGroups();
  const mutations = useOrderMutations();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState("all");
  const [pendingAction, setPendingAction] = useState(null);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Role-based filtering: cashier sees beverages, kitchen sees food
  const isCashier = user?.role === "cashier";
  const categoryFilter = isCashier ? "Beverages" : "Food";

  // Filter items by role (category_name from backend = root category)
  const filterByRole = (orders) => {
    return orders.map((order) => ({
      ...order,
      items: order.items.filter((item) => {
        if (!item.category_name) return true;
        return item.category_name === categoryFilter;
      }),
    })).filter((order) => order.items.length > 0);
  };

  const allOrders = useMemo(() => [...preparing, ...accepted, ...completedToday], [preparing, accepted, completedToday]);

  const roleFiltered = useMemo(() => filterByRole(allOrders), [allOrders, categoryFilter]);

  const displayOrders = useMemo(() => {
    const active = roleFiltered.filter((o) => o.status === "preparing" || o.status === "accepted");
    if (activeTab === "all") return active;
    return roleFiltered.filter((o) => o.status === activeTab);
  }, [roleFiltered, activeTab]);

  const batches = batchData?.data?.batches ?? [];

  async function handleAction(orderId, action) {
    if (action === "prepare") {
      try {
        await mutations.prepare.mutateAsync(orderId);
        toast.success("Order is now preparing");
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to prepare order");
      }
    } else if (action === "markReady") {
      setPendingAction({ orderId, type: "ready" });
    }
  }

  async function handleToggleItem(orderId, itemId, isPrepared) {
    try {
      await mutations.checkItem.mutateAsync({ orderId, itemId, data: { is_prepared: isPrepared } });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update item");
    }
  }

  async function handleConfirmReady() {
    if (!pendingAction) return;
    try {
      setAnimatingOut(true);
      await new Promise((r) => setTimeout(r, 550));
      await markReady(pendingAction.orderId);
      toast.success("Order completed");
      setPendingAction(null);
      setAnimatingOut(false);
    } catch (err) {
      setAnimatingOut(false);
      toast.error(err.response?.data?.message || "Could not complete order");
    }
  }

  if (loading) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground font-sans flex items-center justify-center">
        <PrimarySpinner />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col">
      <KitchenHeader refreshing={refreshing} />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/60 shrink-0">
        {TABS.map((tab) => {
          const count = tab.key === "all"
            ? roleFiltered.filter((o) => o.status === "preparing" || o.status === "accepted").length
            : roleFiltered.filter((o) => o.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Batch sidebar toggle */}
        {batches.length > 0 && (
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sidebarOpen
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Icon name="list" size={14} />
            Batches
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-primary/20 text-primary">
              {batches.length}
            </span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Order Grid */}
        <div className="flex-1 overflow-y-auto p-4 modal-scroll">
          {displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground opacity-40">
              <Icon name="coffee" size={40} />
              <div className="text-sm font-semibold">
                {activeTab === "all" ? "No active orders" : `No ${activeTab} orders`}
              </div>
              <div className="text-xs">
                {activeTab === "all" ? "Waiting for new orders..." : "Nothing here yet"}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {displayOrders.map((order) => (
                <OrderCard
                  key={order.order_id}
                  order={order}
                  onToggleItem={handleToggleItem}
                  onMarkReady={(id) => handleAction(id, order.status === "accepted" ? "prepare" : "markReady")}
                  disabled={markingReady || animatingOut}
                />
              ))}
            </div>
          )}
        </div>

        {/* Batch Sidebar */}
        {sidebarOpen && (
          <BatchSidebar
            batches={batches}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      <ConfirmReadyModal
        order={allOrders.find((o) => o.order_id === pendingAction?.orderId)}
        open={!!pendingAction}
        onConfirm={handleConfirmReady}
        onCancel={() => !markingReady && setPendingAction(null)}
        loading={markingReady}
      />
    </div>
  );
}
