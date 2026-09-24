import { Router } from "express";
import { anomalyController } from "./anomalyDetection.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import { anomalyQuerySchema, activeAnomalyQuerySchema, anomalyIdParamSchema } from "./anomalyDetection.validation.js";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

router.get("/results", validateQuery(anomalyQuerySchema), anomalyController.getResults);
router.get("/active", validateQuery(activeAnomalyQuerySchema), anomalyController.getActive);
router.get("/stats", anomalyController.getStats);
router.post("/scan", anomalyController.triggerScan);
router.patch("/:id/acknowledge", validateParams(anomalyIdParamSchema), anomalyController.acknowledge);

export default router;
