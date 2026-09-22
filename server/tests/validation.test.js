import { describe, it, expect } from "vitest";
import { notificationQuerySchema } from "../src/modules/notifications/notification.validation.js";
import { anomalyIdParamSchema } from "../src/modules/anomalyDetection/anomalyDetection.validation.js";
import { forecastJobQuerySchema } from "../src/modules/forecasting/forecasting.validation.js";

describe("query/param validation", () => {
  it("accepts the 56-char Orders chip CSV", () => {
    const csv = "order_new,order_completed,order_accepted,order_cancelled";
    expect(csv.length).toBeGreaterThan(50);
    const r = notificationQuerySchema.safeParse({ page: "1", limit: "20", type: csv });
    expect(r.success).toBe(true);
  });

  it("rejects an oversized type filter", () => {
    const r = notificationQuerySchema.safeParse({ page: "1", limit: "20", type: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("rejects malformed UUID params", () => {
    expect(anomalyIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(anomalyIdParamSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(true);
  });

  it("coerces jobId to positive int and rejects junk", () => {
    expect(forecastJobQuerySchema.safeParse({ jobId: "12" }).data.jobId).toBe(12);
    expect(forecastJobQuerySchema.safeParse({ jobId: "../../etc" }).success).toBe(false);
    expect(forecastJobQuerySchema.safeParse({ jobId: "-3" }).success).toBe(false);
  });
});
