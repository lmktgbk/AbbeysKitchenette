import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Imports
import { env } from "./config/env.js";
import prisma from "./config/prisma.js";
import errorHandler from "./middleware/errorHandler.middleware.js";
import { generalLimiter } from "./middleware/rateLimitin.middleware.js";

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

/**
 * Security Headers
 * Set HTTP headers and provide XSS protection
 */
app.use(helmet());

// Cors - allow only permitted frontend to make req
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// Logs method, URL, status code, response time.
// Only in development to avoid noise in production logs.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// parses incoming req bodies
// - JSON: { "email": "test@test.com" }
// - URL-encoded: email=test%40test.com
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Makes req.cookies available (for JWT httpOnly cookie).
app.use(cookieParser());

// Protects against DDoS and accidental high-volume requests.
// 500 req / 15 min per IP globally; tighter limiters guard auth,
// checkout, and other sensitive endpoints individually.
app.use(generalLimiter);

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

// Health check endpoint (used by hosting platforms to verify server is running)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Readiness probe — verifies dependencies, not just the process.
// Hosting should gate traffic on this: 200 only when DB + ML are reachable.
app.get("/api/ready", async (req, res) => {
  const checks = { database: false, mlService: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    // reported below
  }
  try {
    const mlUrl = process.env.FORECAST_URL || "http://localhost:8000";
    const response = await fetch(`${mlUrl}/health`, { signal: AbortSignal.timeout(3000) });
    checks.mlService = response.ok;
  } catch {
    // reported below
  }
  const ready = checks.database && checks.mlService;
  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? "Ready" : "Dependency check failed",
    error: ready ? null : "NOT_READY",
    data: { ready, checks, timestamp: new Date().toISOString() },
  });
});

// Global error handler: Catches all errors thrown by middleware/routes.
// Must be last
app.use(errorHandler);

export default app;
