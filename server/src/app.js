import express from "express";
import { browserCors, browserWriteGuard } from "./middleware/browserSecurity.middleware.js";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Imports
import { env } from "./config/env.js";
import { healthRoutes } from "./infrastructure/operations/readiness.js";
import { requestTelemetry, operationsRoutes } from "./infrastructure/operations/observability.js";

import errorHandler from "./middleware/errorHandler.middleware.js";
import { requestBodyParsers } from "./middleware/requestBody.middleware.js";
import { generalLimiter } from "./middleware/rateLimit.middleware.js";

// Routes
import authRoutes from "./modules/auth/auth.routes.js";
import categoryRoutes from "./modules/categories/category.routes.js";
import ingredientRoutes from "./modules/ingredients/ingredient.routes.js";
import productRoutes from "./modules/products/product.routes.js";
import orderRoutes from "./modules/orders/order.routes.js";
import guestRoutes from "./modules/guest/guest.routes.js";
import staffRoutes from "./modules/staff/staff.routes.js";
import forecastingRoutes from "./modules/forecasting/forecasting.routes.js";
import reorderSuggestionsRoutes from "./modules/reorderSuggestions/reorderSuggestions.routes.js";
import wasteReductionRoutes from "./modules/wasteReduction/wasteReduction.routes.js";
import priceOptimizationRoutes from "./modules/priceOptimization/priceOptimization.routes.js";
import marketBasketRoutes from "./modules/marketBasket/marketBasket.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import auditLogRoutes from "./modules/auditLogs/auditLog.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import anomalyDetectionRoutes from "./modules/anomalyDetection/anomalyDetection.routes.js";
import shiftRoutes from "./modules/shifts/shift.routes.js";
import transactionRoutes from "./modules/transactions/transaction.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";

const app = express();
app.disable("etag");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
// Production platforms collect stdout; emit bounded, redacted request events.
app.use(requestTelemetry.middleware);

/**
 * Security Headers
 * Set HTTP headers and provide XSS protection
 */
app.use(helmet());

app.use(browserCors());
app.use(browserWriteGuard());

// Logs method, URL, status code, response time.
// Only in development to avoid noise in production logs.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// parses incoming req bodies
// - JSON: { "email": "test@test.com" }
// - URL-encoded: email=test%40test.com
app.use(requestBodyParsers());

// Makes req.cookies available (for JWT httpOnly cookie).
app.use(cookieParser());

// Protects against DDoS and accidental high-volume requests.
// 500 req / 15 min per IP globally; tighter limiters guard auth,
// checkout, and other sensitive endpoints individually.
app.use(healthRoutes());
app.use(generalLimiter);
app.use("/api/operations", operationsRoutes());

// Routes endpoints
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/forecasting", forecastingRoutes);
app.use("/api/reorder-suggestions", reorderSuggestionsRoutes);
app.use("/api/waste-reduction", wasteReductionRoutes);
app.use("/api/price-optimization", priceOptimizationRoutes);
app.use("/api/market-basket", marketBasketRoutes);
// Canonical new name after the MBA → Promotions rename; market-basket kept
// for backward compatibility (bookmarks, old clients).
app.use("/api/promotions", marketBasketRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/anomaly", anomalyDetectionRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/analytics", analyticsRoutes);

// Global error handler: Catches all errors thrown by middleware/routes.
// Must be last
app.use(errorHandler);

export default app;
