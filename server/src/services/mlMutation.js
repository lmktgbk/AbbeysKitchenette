import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import { recordEffects } from "./domainEffects.js";
import { fetchMl } from "./mlClient.js";

/** External admission is not a database commit; uncertain results are never replayed here. */
export async function proxyMlMutation(req, res, path, { serviceLabel, fallbackCode, okMessage, body, action, targetType, targetId }) {
  const requestId = crypto.randomUUID();
  const capture = details => prisma.$transaction(tx => recordEffects(tx, { audit: {
    userId: req.user.id, action, targetType, targetId, details: { requestId, source: "manual", ...details },
  } }), { timeout: 5000 });
  try {
    // Persist the attempt before making a request that may succeed without a response.
    await capture({ stage: "requested", outcome: "not-confirmed" });
  } catch {
    return res.status(503).json({ success: false, message: "Could not record the action. Try again later.", error: "ML_AUDIT_UNAVAILABLE", data: null });
  }
  let response, data;
  try {
    response = await fetchMl(path, { method: "POST", body });
    if (response.ok) data = await response.json();
  } catch {
    await capture({ stage: "outcome", outcome: "unconfirmed" }).catch(() => console.warn("[ml] Admission outcome capture unavailable"));
    return res.status(503).json({ success: false, message: "ML outcome is unconfirmed. Check job history before submitting again.", error: "ML_OUTCOME_UNCONFIRMED", data: null });
  }
  try {
    await capture({ stage: "outcome", outcome: response.ok ? "service-accepted" : "service-rejected",
      status: response.status, ...(Number.isSafeInteger(data?.job_id) ? { jobId: data.job_id } : {}) });
  } catch {
    // Keep a known service response usable; the persisted attempt still requires reconciliation.
    console.warn("[ml] Admission outcome capture unavailable");
  }
  return res.status(response.ok ? 200 : response.status).json({ success: response.ok,
    message: response.ok ? okMessage : `${serviceLabel} service error: ${response.status}`,
    error: response.ok ? undefined : fallbackCode, data: response.ok ? data : null });
}
