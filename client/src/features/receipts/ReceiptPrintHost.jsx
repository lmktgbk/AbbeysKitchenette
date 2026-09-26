import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ReceiptPrint from "./components/ReceiptPrint";
import { getReceiptRequest } from "./api";
import "./receipt-print.css";

/**
 * ReceiptPrintHost (BR-03)
 *
 * Mount once per layout (POS terminal + admin shell). Listens for
 * "print-receipt" events, fetches the payload, renders it into a
 * body-level print root (so @media print rules apply cleanly),
 * fires window.print(), then clears the job.
 */
export default function ReceiptPrintHost() {
  const [job, setJob] = useState(null); // { payload, key }
  // Monotonic print-request sequence: overlapping auto-print + manual
  // reprint must never interleave — only the latest request may set the
  // job and fire window.print(); superseded fetches are dropped.
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function handlePrint(e) {
      const orderId = e?.detail?.orderId;
      if (!orderId) return;
      const seq = ++seqRef.current;
      try {
        const res = await getReceiptRequest(orderId);
        if (!cancelled && seq === seqRef.current) setJob({ payload: res.data, key: Date.now() });
      } catch {
        // Receipt fetch failed — never pop a print dialog for nothing.
        if (!cancelled && seq === seqRef.current) setJob(null);
      }
    }
    window.addEventListener("print-receipt", handlePrint);
    return () => {
      cancelled = true;
      window.removeEventListener("print-receipt", handlePrint);
    };
  }, []);

  // Fire print once the receipt has rendered. The logo image gets a decode
  // gate (not just a fixed delay) so thermal output never prints blank art;
  // a timeout fallback guarantees printing still happens offline/slow-net.
  useEffect(() => {
    if (!job) return undefined;
    let fired = false;
    function firePrint() {
      if (fired) return;
      fired = true;
      window.print();
    }
    async function waitForAssets() {
      try {
        const imgs = Array.from(
          document.querySelectorAll("#print-root-thermal img"),
        );
        await Promise.all([
          ...imgs.map((img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : typeof img.decode === "function"
                ? img.decode().catch(() => {})
                : new Promise((res) => {
                    img.addEventListener("load", res, { once: true });
                    img.addEventListener("error", res, { once: true });
                  }),
          ),
          (document.fonts?.ready ?? Promise.resolve()).catch(() => {}),
        ]);
      } catch {
        // Fall through to print regardless — never hang the sale.
      }
      firePrint();
    }
    const t = setTimeout(firePrint, 1500);
    waitForAssets().then(() => clearTimeout(t)).catch(() => clearTimeout(t));
    return () => clearTimeout(t);
  }, [job]);

  // Clear the job after printing so reprints re-render fresh. Keyed to the
  // job so an afterprint from a superseded dialog can't wipe its successor.
  useEffect(() => {
    if (!job) return undefined;
    const key = job.key;
    function handleAfter() {
      setJob((j) => (j?.key === key ? null : j));
    }
    window.addEventListener("afterprint", handleAfter);
    return () => window.removeEventListener("afterprint", handleAfter);
  }, [job]);

  return createPortal(
    <div id="print-root-thermal" key={job?.key}>
      {job && <ReceiptPrint payload={job.payload} />}
    </div>,
    document.body,
  );
}
