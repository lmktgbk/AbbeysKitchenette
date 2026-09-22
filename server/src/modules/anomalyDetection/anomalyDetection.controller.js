import { anomalyService } from "./anomalyDetection.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

export const anomalyController = {
  async getResults(req, res) {
    try {
      const { page, limit, severity, category, acknowledged } = req.validatedQuery || {};
      const result = await anomalyService.getResults({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        severity,
        category,
        acknowledged,
      });
      return successResponse(res, "Anomaly results retrieved", result);
    } catch (error) {
      console.error("[GET_ANOMALY_RESULTS]", error);
      return errorResponse(res, "Something went wrong", null, 500, "GET_ANOMALY_RESULTS_ERROR");
    }
  },

  async getActive(req, res) {
    try {
      const severityParam = req.validatedQuery?.severity || "critical,high";
      const severities = severityParam.split(",").map((s) => s.trim());
      const result = await anomalyService.getActive(severities);
      return successResponse(res, "Active anomalies retrieved", result);
    } catch (error) {
      console.error("[GET_ACTIVE_ANOMALIES]", error);
      return errorResponse(res, "Something went wrong", null, 500, "GET_ACTIVE_ANOMALIES_ERROR");
    }
  },

  async getStats(req, res) {
    try {
      const result = await anomalyService.getStats();
      return successResponse(res, "Anomaly stats retrieved", result);
    } catch (error) {
      console.error("[GET_ANOMALY_STATS]", error);
      return errorResponse(res, "Something went wrong", null, 500, "GET_ANOMALY_STATS_ERROR");
    }
  },

  async triggerScan(req, res) {
    try {
      const { rules } = req.body || {};
      const result = await anomalyService.runScan(rules || null);
      return successResponse(res, "Anomaly scan complete", result);
    } catch (error) {
      console.error("[TRIGGER_SCAN]", error);
      return errorResponse(res, "Something went wrong", null, 500, "TRIGGER_SCAN_ERROR");
    }
  },

  async acknowledge(req, res) {
    try {
      await anomalyService.acknowledge(req.params.id);
      auditLogService.logAction({
        userId: req.user.id,
        action: ACTIONS.ANOMALY_ACKNOWLEDGED,
        targetType: "anomaly",
        targetId: req.params.id,
      }).catch(() => {});
      return successResponse(res, "Anomaly acknowledged");
    } catch (error) {
      console.error("[ACKNOWLEDGE_ANOMALY]", error);
      return errorResponse(res, "Something went wrong", null, 500, "ACKNOWLEDGE_ANOMALY_ERROR");
    }
  },
};
