/**
 * Daily Report Service — yesterday-in-review email for admins.
 *
 * WHY it exists: one curated "how did yesterday go" digest so owners don't
 * open the dashboard to know. Covers the just-finished Manila business day
 * (00:30 send for a ~midnight close). Same data as the analytics dashboard
 * and PDF export, trimmed for email: KPIs + deltas, Top 5 variants, waste,
 * drawer totals, open-orders carryover.
 *
 * Reliability: best-effort like the other automation jobs — success AND
 * failure land in the audit trail (DAILY_REPORT_SENT), no retries, no
 * catch-up for missed runs. A mailer-less dev setup logs instead of sending
 * (see config/nodemailer.js fallback).
 */

import prisma from "../../config/prisma.js";
import { toManilaDateString } from "../../config/time.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { analyticsRepository } from "../analytics/analytics.repository.js";
import { shiftService } from "../shifts/shift.service.js";
import { orderRepository } from "../orders/order.repository.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
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
   * so emailed figures always agree with the app.
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
  async sendDailyReport(dayStr) {
    const report = await this.buildReport(dayStr);
    const recipients = await this.adminEmails();
    if (recipients.length === 0) {
      await auditLogService
        .logAction({
          action: ACTIONS.DAILY_REPORT_SENT,
          targetType: "report",
          details: { day: report.day, sent: 0, note: "no active admin emails" },
        })
        .catch(() => {});
      return { sent: 0, day: report.day };
    }
    const { subject, html } = generateDailyReportEmail(report);
    // Day-scoped PDF, byte-identical pipeline to the dashboard PDF export.
    // Missing pdfkit degrades to HTML-only (audited, never fatal).
    let attachments;
    try {
      const { fetchExportData } = await import("../analytics/analytics.controller.js");
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
    } catch (err) {
      console.warn("[report] PDF attachment skipped:", err?.message);
    }
    const failures = [];
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, html, attachments });
      } catch (err) {
        failures.push(`${to}: ${err?.message}`);
      }
    }
    await auditLogService
      .logAction({
        action: ACTIONS.DAILY_REPORT_SENT,
        targetType: "report",
        details: {
          day: report.day,
          sent: recipients.length - failures.length,
          recipients,
          pdf: !!attachments,
          ...(failures.length > 0 ? { failures } : {}),
        },
      })
      .catch(() => {});
    if (failures.length === recipients.length) {
      throw new Error(`Daily report failed for all recipients: ${failures.join("; ")}`);
    }
    return { sent: recipients.length - failures.length, day: report.day };
  },
};
