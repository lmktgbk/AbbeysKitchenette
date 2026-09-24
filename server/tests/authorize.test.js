import { describe, it, expect } from "vitest";
import authorize from "../src/middleware/authorize.middleware.js";
import { AppError } from "../src/middleware/errorHandler.middleware.js";

function run(role) {
  return new Promise((resolve) => {
    const req = { user: { role } };
    authorize("admin")(req, {}, (err) => resolve(err));
  });
}

describe("authorize middleware", () => {
  it("lets admin through with no error", async () => {
    await expect(run("admin")).resolves.toBeUndefined();
  });

  it("blocks cashier with 403 FORBIDDEN AppError", async () => {
    const err = await run("cashier");
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("blocks kitchen with 403 FORBIDDEN AppError", async () => {
    const err = await run("kitchen");
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });
});
