import { describe, it, expect } from "vitest";
import { controllerError, mapPrismaError } from "../src/utils/response.js";
import { AppError } from "../src/middleware/errorHandler.middleware.js";

function stubRes() {
  const r = {};
  r.status = (code) => {
    r.statusCode = code;
    return r;
  };
  r.json = (body) => {
    r.body = body;
    return r;
  };
  return r;
}

describe("controllerError envelope", () => {
  it("passes AppError through with its status and code", () => {
    const res = stubRes();
    controllerError(res, new AppError(404, "Order not found", "ORDER_NOT_FOUND"), "X_ERROR");
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Order not found", error: "ORDER_NOT_FOUND", data: null });
  });

  it("maps P2002 to 409 DUPLICATE_ENTRY", () => {
    const res = stubRes();
    controllerError(res, Object.assign(new Error("dup"), { code: "P2002" }), "X_ERROR");
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("DUPLICATE_ENTRY");
  });

  it("maps P2025 to 409 CONCURRENT_STOCK", () => {
    const res = stubRes();
    controllerError(res, Object.assign(new Error("gone"), { code: "P2025" }), "X_ERROR");
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("CONCURRENT_STOCK");
  });

  it("maps P2003 to 409 INVALID_REFERENCE", () => {
    const res = stubRes();
    controllerError(res, Object.assign(new Error("fk"), { code: "P2003" }), "X_ERROR");
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("INVALID_REFERENCE");
  });

  it("hides internals behind the caller fallback code (no stack/schema leak)", () => {
    const res = stubRes();
    const err = new Error("column orders.total_amount does not exist");
    err.stack = "Error: boom\n at prisma.client...";
    controllerError(res, err, "GET_ORDERS_ERROR");
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Something went wrong", error: "GET_ORDERS_ERROR", data: null });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/stack|prisma|postgres|column/i);
  });

  it("mapPrismaError returns null for unknown errors", () => {
    expect(mapPrismaError(new Error("x"))).toBeNull();
    expect(mapPrismaError(null)).toBeNull();
  });
});
