import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("../../client/src/realtime/socket.js", () => ({ stopRealtime: vi.fn(), startRealtime: vi.fn() }));

import queryClient from "../../client/src/config/queryClient.js";
import useAuthStore from "../../client/src/features/auth/authStore.js";
import { establishSession, restoreSession, clearSession, getSessionEpoch } from "../../client/src/features/auth/session.js";
import { stopRealtime, startRealtime } from "../../client/src/realtime/socket.js";
import api from "../../client/src/config/axios.js";
import { logoutSession } from "../../client/src/features/auth/useLogout.js";

const first = { id: "first", name: "First", role: "admin" };
const second = { id: "second", name: "Second", role: "cashier" };
beforeEach(async () => { await clearSession(); vi.clearAllMocks(); });
afterEach(async () => { vi.restoreAllMocks(); await clearSession(); });

describe("client cookie-session state", () => {
  it("clears the previous operator's data and restores auth query/store together", async () => {
    restoreSession(first);
    queryClient.setQueryData(["staff"], [{ name: "Private data" }]);
    queryClient.setQueryData(["orders"], [{ id: "old-order" }]);
    await establishSession(second);
    expect(queryClient.getQueryData(["staff"])).toBeUndefined();
    expect(queryClient.getQueryData(["orders"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"]).data.user).toEqual(second);
    expect(useAuthStore.getState().user).toEqual(second);
    expect(stopRealtime).toHaveBeenCalled();
    expect(startRealtime).toHaveBeenCalled();
  });
  it("keeps the session when server-side logout fails", async () => {
    restoreSession(first);
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 503 } });
    expect(await logoutSession()).toBe(false);
    expect(useAuthStore.getState().user).toEqual(first);
  });
  it("clears the session after successful or already-expired logout", async () => {
    for (const expired of [false, true]) {
      restoreSession(first);
      const request = vi.spyOn(api, "post");
      if (expired) request.mockRejectedValue({ response: { status: 401 } });
      else request.mockResolvedValue({ data: { success: true } });
      expect(await logoutSession()).toBe(true);
      expect(useAuthStore.getState().user).toBeNull();
      expect(queryClient.getQueryData(["auth", "me"]).data.user).toBeNull();
    }
  });
  it("clears revoked sessions when a protected API returns 401", async () => {
    restoreSession(first);
    await expect(api.get("/private", { adapter: async config => {
      throw { config, response: { status: 401, data: { error: "UNAUTHORIZED" } } };
    } })).rejects.toMatchObject({ response: { status: 401 } });
    await vi.waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });
  it("ignores a late 401 from an older operator or rotated session", async () => {
    restoreSession(first);
    let rejectRequest;
    const request = api.get("/private", { adapter: config => new Promise((_, reject) => {
      rejectRequest = () => reject({ config, response: { status: 401, data: { error: "UNAUTHORIZED" } } });
    }) });
    const rejected = expect(request).rejects.toMatchObject({ response: { status: 401 } });
    await vi.waitFor(() => expect(rejectRequest).toBeTypeOf("function"));
    const epoch = getSessionEpoch();
    await establishSession(second);
    expect(getSessionEpoch()).toBeGreaterThan(epoch);
    rejectRequest(); await rejected;
    expect(useAuthStore.getState().user).toEqual(second);
  });
});
