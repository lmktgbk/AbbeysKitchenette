import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ReceiptPrint from "./components/ReceiptPrint";
import {
  getReceiptRequest,
  getPaperSize,
  getPrinterConnection,
  shouldPrintLogo,
} from "./api";
import { buildReceiptBytes, buildSampleBytes } from "./escpos";
import { loadLogoRaster } from "./logo";
import {
  printViaRawBT,
  printViaWebUSB,
  downloadEscposJob,
} from "./printerService";
import "./receipt-print.css";

/**
 * ReceiptPrintHost (BR-03)
 *
 * Mount once per layout (POS terminal + admin shell). Listens for
 * "print-receipt" events, fetches the payload, renders it into a
 * body-level print root (so @media print rules apply cleanly),
 * fires window.print(), then clears the job.
 *
 * Transports (per-terminal setting, no backend):
 * - "system": window.print() via the OS driver queue. Laptop USB001,
 *   laptop Bluetooth COM8 queue, or Android USB OTG + print-service app.
 * - "rawbt": ESC/POS bytes handed to the RawBT app (Android tablet +
 *   JP-58H Bluetooth SPP, PIN 0000) — Chrome can't open SPP directly.
 * - "webusb": experimental direct USB bulk transfer.
 */

function samplePayload() {
  const now = new Date().toISOString();
  return {
    store: { name: "Abbey's Kitchenette", address: "Test print — 58mm OK", phone: "" },
    order: {
      order_number: 0,
      order_source: "walk-in",
      created_at: now,
      table_number: "-",
      customer_name: "Test",
      payment_method: "cash",
      items: [
        { order_item_id: "sample-1", product_name: "Sample Item", size_name: null, quantity: 1, unit_price: 100, subtotal: 100 },
      ],
      subtotal_amount: 100,
      total_amount: 100,
      amount_paid: 100,
      change: 0,
    },
  };
}

export default function ReceiptPrintHost() {
  const [job, setJob] = useState(null); // { payload, paperSize, showLogo, key }
  // Monotonic print-request sequence: overlapping auto-print + manual
  // reprint must never interleave — only the latest request may set the
  // job and fire window.print(); superseded fetches are dropped.
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function sendRawJob(payload) {
      const paperSize = getPaperSize();
      const includeLogo = shouldPrintLogo();
      const connection = getPrinterConnection();
      let logoRaster = null;
      if (includeLogo) {
        logoRaster = await loadLogoRaster().catch(() => null);
      }
      const bytes = payload === "sample"
        ? buildSampleBytes({ paperSize, logoRaster, includeLogo: includeLogo && !!logoRaster })
        : buildReceiptBytes(payload, { paperSize, logoRaster, includeLogo: includeLogo && !!logoRaster });
      if (connection === "webusb") {
        try {
          if (await printViaWebUSB(bytes)) return true;
        } catch {
          // Fall through to the RawBT/download path below.
        }
      }
      try {
        printViaRawBT(bytes);
        return true;
      } catch {
        downloadEscposJob(bytes);
        return false;
      }
    }

    async function handlePrint(e) {
      const orderId = e?.detail?.orderId;
      if (!orderId) return;
      const seq = ++seqRef.current;
      const connection = getPrinterConnection();
      try {
        const res = await getReceiptRequest(orderId);
        if (cancelled || seq !== seqRef.current) return;
        if (connection === "rawbt" || connection === "webusb") {
          await sendRawJob(res.data);
          return;
        }
        setJob({
          payload: res.data,
          paperSize: getPaperSize(),
          showLogo: shouldPrintLogo(),
          key: Date.now(),
        });
      } catch {
        // Receipt fetch failed — never pop a print dialog for nothing.
        if (!cancelled && seq === seqRef.current) setJob(null);
      }
    }

    async function handleSample() {
      const seq = ++seqRef.current;
      const connection = getPrinterConnection();
      if (cancelled || seq !== seqRef.current) return;
      if (connection === "rawbt" || connection === "webusb") {
        await sendRawJob("sample");
        return;
      }
      setJob({
        payload: samplePayload(),
        paperSize: getPaperSize(),
        showLogo: shouldPrintLogo(),
        key: Date.now(),
      });
    }

    window.addEventListener("print-receipt", handlePrint);
    window.addEventListener("print-receipt-sample", handleSample);
    return () => {
      cancelled = true;
      window.removeEventListener("print-receipt", handlePrint);
      window.removeEventListener("print-receipt-sample", handleSample);
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
    <div id="print-root-thermal" data-paper={job?.paperSize ?? getPaperSize()} key={job?.key}>
      {job && <ReceiptPrint payload={job.payload} paperSize={job.paperSize} showLogo={job.showLogo} />}
    </div>,
    document.body,
  );
}
