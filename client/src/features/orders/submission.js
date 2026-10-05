/**
 * Owns browser retry identity for walk-in, guest, acceptance, and fulfillment submissions.
 * A lost response does not prove failure: the API may already have committed the order.
 * Replaying the same Idempotency-Key lets the backend return that original result.
 * This module coordinates one tab; backend transactions and unique keys enforce consistency.
 */
import useAuthStore from "@/features/auth/authStore";
import { canonicalJson } from "../../../../shared/canonicalJson.js";

// Tracks active promises in this browser context; sessionStorage retains retry identity across refreshes.
const inFlight = new Map();

/**
 * Sends one operation with a stable key until success or a definitive rejection.
 * @param {string} operation Operation scope, including the order ID for actions on an existing order.
 * @param {object} data Request details used to recognize an unchanged retry.
 * @param {(key: string) => Promise<unknown>} send API callback that adds the supplied Idempotency-Key.
 * @returns {Promise<unknown>} The callback response; transport errors are rethrown to the caller.
 */
export async function submitOrder(operation, data, send) {
  // Separate retry slots by operator and action; public guest creation uses its own scope.
  const actor =
    operation === "guest-order" ? "guest" : useAuthStore.getState().user?.id;
  if (!actor) throw new Error("Sign in before submitting an order");
  const slot = `smartcafe:submission:${actor}:${operation}`;
  // Fingerprint a copy, excluding the server-owned order date; the original request is not mutated.
  const payload = { ...data };
  delete payload.order_date;
  // Canonical key ordering makes equivalent payloads produce the same SHA-256 fingerprint.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(payload)),
  );
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  // A refresh can recover the key, but the caller must still supply the original order details.
  const previous = JSON.parse(sessionStorage.getItem(slot) || "null");
  // Do not replace a possibly committed order with a different payload under this operation slot.
  if (previous?.uncertain && previous.fingerprint !== fingerprint) {
    throw new Error(
      "Your previous submission may have succeeded. Retry its original details or verify the order before starting another",
    );
  }
  // Reuse identity for an unchanged retry; a new intent receives a fresh UUID.
  const pending =
    previous?.fingerprint === fingerprint
      ? previous
      : { key: crypto.randomUUID(), fingerprint };
  // Concurrent callers sharing this key await the same active transport promise.
  if (inFlight.get(slot)?.key === pending.key)
    return inFlight.get(slot).promise;
  // Persist only a digest and random key, never customer details or payment data.
  sessionStorage.setItem(slot, JSON.stringify({ ...pending, uncertain: true }));
  /** Classifies the transport outcome and retains only recoverable submission identity. */
  const execute = async () => {
    try {
      const result = await send(pending.key);
      // Clear only this request’s slot; an older completion must not erase a newer submission.
      if (
        JSON.parse(sessionStorage.getItem(slot) || "null")?.key === pending.key
      )
        sessionStorage.removeItem(slot);
      return result;
    } catch (error) {
      const status = error.response?.status;
      // Network errors, server failures, and timeouts cannot establish whether a commit occurred.
      // Pending/conflicting idempotency responses also retain identity; other rejections allow correction.
      if (!status || status >= 500 || status === 408) {
        sessionStorage.setItem(
          slot,
          JSON.stringify({ ...pending, uncertain: true }),
        );
      } else if (
        error.response?.data?.error !== "IDEMPOTENCY_CONFLICT" &&
        error.response?.data?.error !== "SUBMISSION_PENDING"
      ) {
        if (
          JSON.parse(sessionStorage.getItem(slot) || "null")?.key ===
          pending.key
        )
          sessionStorage.removeItem(slot);
      }
      throw error;
    }
  };
  // Register the active attempt, then release only its own map entry when it settles.
  const promise = execute();
  inFlight.set(slot, { key: pending.key, promise });
  try {
    return await promise;
  } finally {
    if (inFlight.get(slot)?.promise === promise) inFlight.delete(slot);
  }
}
