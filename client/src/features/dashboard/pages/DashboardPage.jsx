import { useState, useCallback } from "react";
import { useTodayDashboard } from "../query";
import DashboardKpis from "../components/DashboardKpis";
import HourlyOrdersChart from "../components/HourlyOrdersChart";
import PaymentMethodChart from "../components/PaymentMethodChart";
import TopProductsTable from "../components/TopProductsTable";
import CategorySalesChart from "../components/CategorySalesChart";
import DiscountRefundVoidCard from "../components/DiscountRefundVoidCard";
import InventoryVarianceCard from "../components/InventoryVarianceCard";
import CashReconciliationCard from "../components/CashReconciliationCard";
import SectionDetailModal from "../components/SectionDetailModal";
import DashboardAnomalyBanner from "@/features/anomalyDetection/components/DashboardAnomalyBanner";

export default function DashboardPage() {
  const { data, isLoading } = useTodayDashboard();
  const d = data?.data;

  const [modal, setModal] = useState(null);
  const openModal = useCallback((section) => setModal(section), []);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <div className="flex flex-col gap-4">
      <DashboardAnomalyBanner />

      <DashboardKpis kpis={d?.kpis} isLoading={isLoading} />

      {/* ─── Sales Trend + Payment Breakdown ─── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HourlyOrdersChart
          data={d?.ordersByHour}
          isLoading={isLoading}
          onDeepDive={() => openModal("salesTrend")}
        />
        <PaymentMethodChart
          data={d?.paymentMethodBreakdown}
          isLoading={isLoading}
          onDeepDive={() => openModal("paymentBreakdown")}
        />
      </div>

      {/* ─── Sales by Product + Sales by Category ─── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopProductsTable
          title="Top Products Today"
          data={d?.topProducts}
          isLoading={isLoading}
          onDeepDive={() => openModal("salesByProduct")}
          showCosts
        />
        <CategorySalesChart
          data={d?.salesByCategory}
          isLoading={isLoading}
          onDeepDive={() => openModal("salesByCategory")}
        />
      </div>

      {/* ─── Discounts/Refunds/Voids + Inventory Variance ─── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DiscountRefundVoidCard
          discountSummary={d?.discountSummary}
          refundSummary={d?.refundSummary}
          cancellationReasons={d?.cancellationReasons}
          cancellationRate={d?.kpis?.cancellationRate}
          isLoading={isLoading}
          onDeepDive={() => openModal("discountsRefundsVoids")}
        />
        <InventoryVarianceCard
          data={d?.inventoryVariance}
          isLoading={isLoading}
          onDeepDive={() => openModal("inventoryVariance")}
        />
      </div>

      {/* ─── Cash Reconciliation (full width) ─── */}
      <CashReconciliationCard
        data={d?.cashReconciliation}
        isLoading={isLoading}
        onDeepDive={() => openModal("cashReconciliation")}
      />

      {/* ─── Deep-Dive Modals ─── */}
      <SectionDetailModal
        open={modal === "salesTrend"}
        onClose={closeModal}
        title="Sales Trend — Hourly Breakdown"
        icon="clock"
      >
        <HourlyOrdersChart data={d?.ordersByHour} isLoading={isLoading} />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "paymentBreakdown"}
        onClose={closeModal}
        title="Payment Method Breakdown"
        icon="creditCard"
      >
        <PaymentMethodChart data={d?.paymentMethodBreakdown} isLoading={isLoading} />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "salesByProduct"}
        onClose={closeModal}
        title="Sales by Product — Today"
        icon="barChart2"
      >
        <TopProductsTable
          title="All Products"
          data={d?.topProducts}
          isLoading={isLoading}
          showCosts
        />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "salesByCategory"}
        onClose={closeModal}
        title="Sales by Category — Today"
        icon="layers"
      >
        <CategorySalesChart data={d?.salesByCategory} isLoading={isLoading} />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "discountsRefundsVoids"}
        onClose={closeModal}
        title="Discounts, Refunds & Voids"
        icon="tag"
      >
        <DiscountRefundVoidCard
          discountSummary={d?.discountSummary}
          refundSummary={d?.refundSummary}
          cancellationReasons={d?.cancellationReasons}
          cancellationRate={d?.kpis?.cancellationRate}
          isLoading={isLoading}
        />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "inventoryVariance"}
        onClose={closeModal}
        title="Inventory Variance — Latest Count"
        icon="clipboardList"
      >
        <InventoryVarianceCard data={d?.inventoryVariance} isLoading={isLoading} />
      </SectionDetailModal>

      <SectionDetailModal
        open={modal === "cashReconciliation"}
        onClose={closeModal}
        title="Cash Reconciliation — Active Shift"
        icon="banknote"
      >
        <CashReconciliationCard data={d?.cashReconciliation} isLoading={isLoading} />
      </SectionDetailModal>
    </div>
  );
}
