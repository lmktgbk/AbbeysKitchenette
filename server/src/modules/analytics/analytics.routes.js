import { Router } from "express";
import { analyticsController } from "./analytics.controller.js";
import { validateQuery } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { getAnalyticsQuerySchema, getTrendQuerySchema, getExportQuerySchema, getVariantProfitQuerySchema, getIngredientProfitQuerySchema, getWasteDetailsQuerySchema } from "./analytics.validation.js";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

router.get("/kpis", validateQuery(getAnalyticsQuerySchema), analyticsController.getKpis);
router.get("/trend", validateQuery(getTrendQuerySchema), analyticsController.getTrend);
router.get("/variants/profitability", validateQuery(getVariantProfitQuerySchema), analyticsController.getVariantProfitability);
router.get("/ingredients/profitability", validateQuery(getIngredientProfitQuerySchema), analyticsController.getIngredientProfitability);
router.get("/ingredients/units", analyticsController.getIngredientUnits);
router.get("/waste/details", validateQuery(getWasteDetailsQuerySchema), analyticsController.getWasteDetails);
router.get("/dashboard", validateQuery(getAnalyticsQuerySchema), analyticsController.getDashboard);
router.get("/export", validateQuery(getExportQuerySchema), analyticsController.exportExcel);

export default router;
