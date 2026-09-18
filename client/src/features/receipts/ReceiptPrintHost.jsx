import { useState, useEffect } from "react";
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

  useEffect(() => {
    let cancelled = false;
    async function handlePrint(e) {
      const orderId = e?.detail?.orderId;
      if (!orderId) return;
      try {
        const res = await getReceiptRequest(orderId);
        if (!cancelled) setJob({ payload: res.data, key: Date.now() });
      } catch {
        // Receipt fetch failed — never pop a print dialog for nothing.
        if (!cancelled) setJob(null);
      }
    }
    window.addEventListener("print-receipt", handlePrint);
    return () => {
      cancelled = true;
      window.removeEventListener("print-receipt", handlePrint);
    };
  }, []);

  // Fire print once the receipt has rendered (images get a beat to load).
  useEffect(() => {
    if (!job) return undefined;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [job]);

  // Clear the job after printing so reprints re-render fresh.
  useEffect(() => {
    if (!job) return undefined;
    function handleAfter() {
      setJob(null);
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
