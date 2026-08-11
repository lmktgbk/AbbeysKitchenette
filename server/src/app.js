import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Imports
import { env } from "./config/env.js";
import errorHandler from "./middleware/errorHandler.middleware.js";

// Imports route

const app = express();

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

// Routes endpoints
// app.use("/api/auth", authRoutes);

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
