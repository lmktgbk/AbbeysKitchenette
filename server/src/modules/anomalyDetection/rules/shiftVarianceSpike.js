import prisma from "../../../config/prisma.js";
import { toManilaDateString } from "../../../config/time.js";

export const shiftVarianceSpike = {
  id: "shift_variance_spike",
  name: "Cash Drawer Variance Detection",
  category: "cash",
  enabled: true,
  // Policeman mode: every closed shift with variance != 0 flags immediately.
  // Severity by absolute peso size so notify behavior matches other rules
  // (only high/critical push a bell; medium stays as a card).
  config: { mediumMax: 50, highMax: 199 },
  // Set by anomalyService.runScan(ruleIds, { shift }) from the close-shift
  // hook so we flag the exact shift that just closed (no re-query race).
  _pendingShift: null,
  async dataFetcher() {
    // 1. Hook path: exact shift payload from closeShift.
    const pending = this._pendingShift;
    if (pending) {
      const variance = Number(pending.variance ?? 0);
      if (!pending.shiftId || variance === 0) return { shouldDetect: false };
      return {
        shouldDetect: true,
        shiftId: pending.shiftId,
        expected: Number(pending.expected ?? 0),
        actual: Number(pending.actual ?? 0),
        variance,
        todayStr: toManilaDateString(),
      };
    }
    // 2. Manual "Check now" / cron fallback: latest closed shift today with
    // variance that has no card yet (checked by service dedup). Keeps the
    // button useful without a hook payload.
    const rows = await prisma.$queryRawUnsafe(`
      SELECT s."shift_id" AS "shiftId", s."expected_cash"::float AS expected,
             s."actual_cash"::float AS actual, s."variance"::float AS variance
      FROM shifts s
      WHERE s."status" = 'closed'
        AND s."variance" IS NOT NULL AND s."variance" <> 0
        AND DATE(s."closed_at" AT TIME ZONE 'Asia/Manila') = DATE((now() AT TIME ZONE 'Asia/Manila'))
      ORDER BY s."closed_at" DESC
      LIMIT 10
    `);
    if (!rows?.length) return { shouldDetect: false };
    // Service dedup picks the first unalarmed shift; expose candidates.
    return {
      shouldDetect: true,
      candidates: rows.map((r) => ({
        shiftId: String(r.shiftId),
        expected: Number(r.expected ?? 0),
        actual: Number(r.actual ?? 0),
        variance: Number(r.variance ?? 0),
      })),
      todayStr: toManilaDateString(),
    };
  },
  condition(data) {
    // Hook path: single shift.
    const single = data.shiftId
      ? {
          shiftId: data.shiftId,
          expected: data.expected,
          actual: data.actual,
          variance: data.variance,
        }
      : null;
    // Manual path: first candidate (service loops the rest via _pendingShift).
    const target = single ?? data.candidates?.[0];
    if (!target || Number(target.variance ?? 0) === 0) return { triggered: false };
    const abs = Math.abs(Number(target.variance));
    const { mediumMax, highMax } = this.config;
    const severity = abs <= mediumMax ? "medium" : abs <= highMax ? "high" : "critical";
    const confidence = 0.95;
    const shortId = String(target.shiftId).slice(0, 8);
    return {
      triggered: true,
      severity,
      title: `Cash Drawer Off ₱${abs.toLocaleString()} Detected`,
      description: `Shift ${shortId} off by ₱${Number(target.variance).toLocaleString()} (expected ₱${Number(target.expected).toLocaleString()}, actual ₱${Number(target.actual).toLocaleString()}) [${target.shiftId}].`,
      actualValue: Number(target.actual),
      expectedValue: Number(target.expected),
      expectedMin: Number(target.expected),
      expectedMax: Number(target.expected),
      confidence,
    };
  },
  geminiPrompt(data) {
    const target = data.shiftId
      ? data
      : data.candidates?.[0] ?? { variance: 0, expected: 0, actual: 0 };
    return `Cash drawer mismatch: shift off ₱${target.variance} (expected ₱${target.expected}, actual ₱${target.actual}). Give 2-3 short checks for miscount, voids, and unrecorded payouts. Under 100 words, numbered.`;
  },
};
