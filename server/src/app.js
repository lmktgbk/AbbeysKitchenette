import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Imports
import { env } from "./config/env.js";
import errorHandler from "./middleware/errorHandler.middleware.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// app.use(generalLimiter);

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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
app.use("/api/settings", settingsRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check endpoint (used by hosting platforms to verify server is running)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Global error handler: Catches all errors thrown by middleware/routes.
// Must be last
app.use(errorHandler);

export default app;
