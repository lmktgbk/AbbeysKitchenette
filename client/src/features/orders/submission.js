import useAuthStore from "@/features/auth/authStore";
import { canonicalJson } from "../../../../shared/canonicalJson.js";

const inFlight = new Map();

export async function submitOrder(operation, data, send) {
  const actor = operation === "guest-order" ? "guest" : useAuthStore.getState().user?.id;
  if (!actor) throw new Error("Sign in before submitting an order");
  const slot = `smartcafe:submission:${actor}:${operation}`;
  const payload = { ...data };
  delete payload.order_date;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(payload)));
  const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const previous = JSON.parse(sessionStorage.getItem(slot) || "null");
  if (previous?.uncertain && previous.fingerprint !== fingerprint) {
    throw new Error("Your previous submission may have succeeded. Retry its original details or verify the order before starting another");
  }
  const pending = previous?.fingerprint === fingerprint ? previous : { key: crypto.randomUUID(), fingerprint };
  if (inFlight.get(slot)?.key === pending.key) return inFlight.get(slot).promise;
  // Persist only a digest and random key, never customer details or payment data.
  sessionStorage.setItem(slot, JSON.stringify({ ...pending, uncertain: true }));
  const execute = async () => {
    try {
      const result = await send(pending.key);
      if (JSON.parse(sessionStorage.getItem(slot) || "null")?.key === pending.key) sessionStorage.removeItem(slot);
      return result;
    } catch (error) {
      const status = error.response?.status;
      if (!status || status >= 500 || status === 408) {
        sessionStorage.setItem(slot, JSON.stringify({ ...pending, uncertain: true }));
      } else if (error.response?.data?.error !== "IDEMPOTENCY_CONFLICT" && error.response?.data?.error !== "SUBMISSION_PENDING") {
        if (JSON.parse(sessionStorage.getItem(slot) || "null")?.key === pending.key) sessionStorage.removeItem(slot);
      }
      throw error;
    }
  };
  const promise = execute();
  inFlight.set(slot, { key: pending.key, promise });
  try { return await promise; }
  finally { if (inFlight.get(slot)?.promise === promise) inFlight.delete(slot); }
}
