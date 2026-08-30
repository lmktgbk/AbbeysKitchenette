import { useState } from "react";
import { useSalesForecast } from "../query";
import ForecastTabs from "../components/ForecastTabs";
import SalesForecastTab from "../components/SalesForecastTab";
import RestockAlertsTab from "../components/RestockAlertsTab";
import ProductTrendsTab from "../components/ProductTrendsTab";
import ForecastServiceError from "../components/ForecastServiceError";

/**
 * ForecastingPage
 *
 * Demand forecasting dashboard with 3 tabs:
 * - Sales Forecast (Prophet-based revenue/order predictions)
 * - Restock Alerts (ingredient consumption + stockout predictions)
 * - Product Trends (sales velocity + trend ranking)
 */
export default function ForecastingPage() {
  const [activeTab, setActiveTab] = useState("sales");

  // Quick check if service is up (using sales endpoint)
  const { error } = useSalesForecast({ period: 7 });

  const isServiceDown = error?.response?.data?.error === "FORECAST_SERVICE_UNAVAILABLE"
    || error?.code === "ERR_NETWORK";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-bold text-foreground">Demand Forecasting</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered predictions for sales, restocking, and product trends
        </p>
      </div>

      <ForecastTabs active={activeTab} onChange={setActiveTab} />

      {isServiceDown ? (
        <ForecastServiceError />
      ) : (
        <>
          {activeTab === "sales" && <SalesForecastTab />}
          {activeTab === "restock" && <RestockAlertsTab />}
          {activeTab === "popularity" && <ProductTrendsTab />}
        </>
      )}
    </div>
  );
}
