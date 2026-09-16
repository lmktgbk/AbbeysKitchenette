import { Router } from "express";
import { anomalyController } from "./anomalyDetection.controller.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import { validateQuery } from "../../middleware/validate.middleware.js";
import { anomalyQuerySchema, activeAnomalyQuerySchema } from "./anomalyDetection.validation.js";

const router = Router();

router.use(authenticate);

router.get("/results", validateQuery(anomalyQuerySchema), anomalyController.getResults);
router.get("/active", validateQuery(activeAnomalyQuerySchema), anomalyController.getActive);
router.get("/stats", anomalyController.getStats);
router.patch("/:id/acknowledge", anomalyController.acknowledge);

export default router;
