/**
 * Build the previous Manila business day's report using shared analytics queries.
 * Scheduled callers supply the original report day and check worker ownership
 * before each recipient. Partial or uncertain SMTP delivery requires review;
 * automatically repeating a whole report can duplicate already accepted mail.
 */

import prisma from "../../config/prisma.js";
import { toManilaDateString } from "../../config/time.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { analyticsRepository } from "../analytics/analytics.repository.js";
import { shiftService } from "../shifts/shift.service.js";
import { orderRepository } from "../orders/order.repository.js";
import crypto from "node:crypto";
import { recordEffects } from "../../infrastructure/effects/domainEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { sendEmail, generateDailyReportEmail } from "../../utils/email.js";

/** Yesterday on the Manila business calendar (the just-finished day). */
export function reportDay(date = new Date()) {
  const [y, m, d] = toManilaDateString(date).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d) - 24 * 3600 * 1000);
  const iso = day.toISOString().split("T")[0];
  return iso;
}

export const dailyReportService = {
  /**
   * Build the report payload for a Manila calendar day (default: yesterday).
   * All reads reuse the analytics/shift/order queries the dashboard uses,
   * keeping arithmetic consistent with the app. Separate queries/requests can
   * observe different commits; this payload is not a transaction-wide snapshot.
   */
  async buildReport(dayStr) {
    const day = dayStr || reportDay();
    const [kpis, variants, shifts, carryover] = await Promise.all([
      analyticsService.getKpis(day, day),
      analyticsRepository.getVariantProfitability({ dateFrom: day, dateTo: day, limit: 5, offset: 0 }),
      shiftService.getStats({ dateFrom: day, dateTo: day }),
      orderRepository.countByStatus({}),
    ]);
    const openOrders = (carryover.pending || 0) + (carryover.accepted || 0) + (carryover.preparing || 0);
    return {
      day,
      kpis,
      topVariants: variants.rows ?? [],
      shifts,
      openOrders,
    };
  },

  /** Active admin emails — recipients resolve at send time (no list to rot). */
  async adminEmails() {
    // email is required + unique on User: no null filter needed (Prisma
    // rejects `not: null` on non-nullable fields).
    const admins = await prisma.user.findMany({
      where: { role: "admin", isActive: true },
      select: { email: true },
    });
    return [...new Set(admins.map((a) => a.email).filter(Boolean))];
  },

  /**
   * Build + send yesterday's report. Returns { sent, day }.
   * Throws on total failure (scheduler audits it); partial per-recipient
   * failures are collected into the audit details instead.
   */
  async sendDailyReport(dayStr, { assertOwned } = {}) {
    const report = await this.buildReport(dayStr);
    const recipients = await this.adminEmails();
    const batchId = crypto.randomUUID();
    const capture = details => prisma.$transaction(tx => recordEffects(tx, { audit: {
      action: details.stage === "attempt" ? ACTIONS.DAILY_REPORT_ATTEMPT : ACTIONS.DAILY_REPORT_SENT,
      targetType: "report", details: { day: report.day, batchId, ...details },
    } }), { timeout: 5000 });
    if (recipients.length === 0) {
      if (assertOwned) await assertOwned();
      await capture({ stage: "summary", sent: 0, note: "no active admin emails" });
      return { sent: 0, day: report.day };
    }
    const { subject, html } = generateDailyReportEmail(report);
    // Reuse the analytics service payload and PDF renderer without importing HTTP controllers.
    // Attachment failures degrade to HTML-only and are recorded in delivery audit.
    let attachments;
    try {
      const { fetchExportData } = await import("../analytics/analytics.service.js");
      const { buildPdfBuffer } = await import("../analytics/exportPdf.js");
      const payload = await fetchExportData({
        date_from: report.day,
        date_to: report.day,
        include: () => true,
        types: ["all"],
      });
      const buffer = await buildPdfBuffer(payload);
      attachments = [{
        filename: `Daily-Report-${report.day}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      }];
    } catch {
      console.warn("[report] PDF attachment unavailable");
    }
    let sent = 0, unconfirmed = 0;
    for (const [recipientIndex, to] of recipients.entries()) {
      if (assertOwned) await assertOwned();
      await capture({ stage: "attempt", recipientIndex, outcome: "not-confirmed", pdf: !!attachments });
      if (assertOwned) await assertOwned();
      let outcome;
      try {
        await sendEmail({ to, subject, html, attachments });
        sent++;
        outcome = "provider-accepted";
      } catch {
        unconfirmed++;
        outcome = "unconfirmed";
      }
      // Lost outcome capture must block scheduled replay, never silently resend mail.
      await capture({ stage: "recipient-outcome", recipientIndex, outcome });
    }
    await capture({ stage: "summary", sent, unconfirmed, recipients: recipients.length, pdf: !!attachments });
    if (!sent) throw new Error("DAILY_REPORT_DELIVERY_UNCONFIRMED");
    if (assertOwned && unconfirmed) throw new Error("SCHEDULED_REPORT_PARTIAL_DELIVERY");
    return { sent, day: report.day };
  },
};
