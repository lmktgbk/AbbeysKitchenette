/**
 * PDF Export Builder (admin analytics report)
 *
 * Renders the same export payload as the Excel workbook into a single
 * landscape-A4 PDF: branded header, KPI summary, one table per chosen
 * section, page-number footer. Tables are code-drawn (no Chromium needed).
 */

const ACCENT = "#bd532b";
const INK = "#1c1008";
const MUTED = "#7c5c3e";
const BORDER = "#e8d5c4";
const HEADER_BG = "#fbf0ea";

const num = (v, digits = 2) =>
  v == null || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(digits);
const int = (v) => (v == null ? "-" : String(v));
const pct = (v) => (v == null ? "-" : `${v}%`);
const delta = (v) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v}%`);
// Short YYYY-MM-DD for Date objects / long timestamp strings.
const shortDate = (v) => {
  if (v == null || v === "") return "-";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
};

function sectionTable(doc, title, columns, rows) {
  const { width, left, right } = pageMetrics(doc);
  const tableWidth = width - left - right;
  const totalFlex = columns.reduce((s, c) => s + (c.flex || 1), 0);
  const colWidths = columns.map((c) => (tableWidth * (c.flex || 1)) / totalFlex);

  const headerH = 22;
  const minRowH = 18;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const measureRow = (cells, font, size) => {
    doc.font(font).fontSize(size);
    let h = minRowH;
    cells.forEach((cell, i) => {
      const tw = colWidths[i] - 8;
      const needed = doc.heightOfString(String(cell ?? "-"), { width: tw }) + 8;
      if (needed > h) h = needed;
    });
    return h;
  };

  const drawRow = (cells, { header = false, rowH = minRowH } = {}) => {
    let x = left;
    const y = doc.y;
    const h = header ? headerH : rowH;
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 9 : 8.5);
    if (header) {
      doc.rect(left, y, tableWidth, h).fill(HEADER_BG);
      doc.fillColor(INK);
    } else {
      doc.fillColor(MUTED);
      doc
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .moveTo(left, y + h)
        .lineTo(left + tableWidth, y + h)
        .stroke();
    }
    columns.forEach((c, i) => {
      const w = colWidths[i];
      const align = c.align || "left";
      const tx = align === "right" ? x : x + 4;
      const tw = align === "right" ? w - 4 : w - 8;
      doc.text(String(cells[i] ?? "-"), tx, y + 4, {
        width: tw,
        height: h - 4,
        align,
        ellipsis: true,
      });
      x += w;
    });
    doc.y = y + h;
  };

  const headerCells = columns.map((c) => c.header);
  const drawHeaderRow = () => drawRow(headerCells, { header: true });

  // Keep section start together: title + header + 2 rows, else fresh page.
  const firstH = rows.length > 0 ? measureRow(columns.map((c) => c.value(rows[0])), "Helvetica", 8.5) : minRowH;
  const secondH = rows.length > 1 ? measureRow(columns.map((c) => c.value(rows[1])), "Helvetica", 8.5) : 0;
  if (doc.y + 26 + headerH + firstH + secondH > bottom()) doc.addPage();

  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title, left, doc.y);
  doc.moveDown(0.4);
  drawHeaderRow();
  for (const r of rows) {
    const cells = columns.map((c) => c.value(r));
    const h = measureRow(cells, "Helvetica", 8.5);
    if (doc.y + h > bottom()) {
      doc.addPage();
      drawHeaderRow();
    }
    drawRow(cells, { rowH: h });
  }
  doc.moveDown(1);
}

function pageMetrics(doc) {
  return {
    width: doc.page.width,
    left: doc.page.margins.left,
    right: doc.page.margins.right,
  };
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/**
 * @param {object} payload - { meta, kpis, orders, variants, ingredients, trend, waste }
 * sections present only when requested. Mirrors Excel columns.
 * @returns {Promise<Buffer>}
 */
export function buildPdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    import("pdfkit").then(
      ({ default: PDFDocument }) => {
        try {
          const doc = new PDFDocument({
            size: "A4",
            layout: "landscape",
            bufferPages: true,
            margins: { top: 50, bottom: 50, left: 40, right: 40 },
            info: {
              Title: "Abbey's Kitchenette — Analytics Report",
              Creator: "Abbey's Kitchenette",
            },
          });
          const chunks = [];
          doc.on("data", (c) => chunks.push(c));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", reject);

          const { left, right, width } = pageMetrics(doc);
          const contentWidth = width - left - right;

          // ── Brand header ──
          doc.rect(left, 30, contentWidth, 6).fill(ACCENT);
          doc
            .font("Helvetica-Bold")
            .fontSize(20)
            .fillColor(ACCENT)
            .text("Abbey's Kitchenette", left, 44, { width: contentWidth, align: "center" });
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(MUTED)
            .text("P O S  &  I N V E N T O R Y  S Y S T E M", { align: "center" });
          doc.moveDown(0.5);
          doc
            .font("Helvetica-Bold")
            .fontSize(15)
            .fillColor(INK)
            .text("Analytics Report", { align: "center" });
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(MUTED)
            .text(
              `Period: ${payload.meta.dateFrom || "All time"} to ${payload.meta.dateTo || "All time"}   ·   Generated: ${payload.meta.generated}`,
              { align: "center" },
            );
          doc.moveDown(1);

          // ── KPI summary ──
          if (payload.kpis) {
            const k = payload.kpis;
            ensureSpace(doc, 90);
            doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Summary", left, doc.y);
            doc.moveDown(0.4);
            const cards = [
              ["Gross Sales", num(k.grossSales), delta(k.deltas?.grossSales)],
              ["Discounts", num(k.discounts), "-"],
              ["Net Sales", num(k.netSales), delta(k.deltas?.netSales)],
              ["Transactions", int(k.transactions), delta(k.deltas?.transactions)],
              ["Avg Ticket", num(k.atv), delta(k.deltas?.atv)],
              ["COGS", num(k.cogs), delta(k.deltas?.cogs)],
              ["Gross Profit", num(k.grossProfit), delta(k.deltas?.grossProfit)],
              ["Net Profit", num(k.netProfit), delta(k.deltas?.netProfit)],
            ];
            const cols = 4;
            const cardW = contentWidth / cols;
            let x = left;
            let rowY = doc.y;
            cards.forEach(([label, value, d], i) => {
              if (i % cols === 0 && i > 0) {
                rowY = doc.y + 8;
                x = left;
              }
              doc.rect(x + 2, rowY, cardW - 4, 52).stroke(BORDER);
              doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, x + 8, rowY + 6, { width: cardW - 16 });
              doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(value, x + 8, rowY + 20, { width: cardW - 16 });
              doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(d, x + 8, rowY + 36, { width: cardW - 16 });
              if ((i + 1) % cols === 0 || i === cards.length - 1) doc.y = rowY + 52;
              x += cardW;
            });
            doc.moveDown(1);
          }

          // ── Sections (mirror Excel columns) ──
          // Orders ledger is capped at the latest 100 rows (query is ASC, so
          // the tail is the newest). Totals still cover the full period.
          const ORDER_PDF_LIMIT = 100;
          if (payload.orders) {
            const { rows, totals } = payload.orders;
            const shown = rows.length > ORDER_PDF_LIMIT ? rows.slice(-ORDER_PDF_LIMIT) : rows;
            sectionTable(
              doc,
              "Orders Ledger",
              [
                { header: "Order #", flex: 1.5, value: (r) => `#${String(r.order_number).padStart(4, "0")}` },
                { header: "Date", flex: 1, value: (r) => shortDate(r.order_date) },
                { header: "Customer", flex: 1.6, value: (r) => int(r.customer_name) },
                { header: "Table", flex: 0.7, value: (r) => int(r.table_number) },
                { header: "Source", flex: 0.8, value: (r) => int(r.order_source) },
                { header: "Units", flex: 0.7, align: "right", value: (r) => int(r.units) },
                { header: "Gross", flex: 1, align: "right", value: (r) => num(r.gross) },
                { header: "Discount", flex: 1, align: "right", value: (r) => num(r.discounts) },
                { header: "Net", flex: 1, align: "right", value: (r) => num(r.net) },
                { header: "COGS", flex: 1, align: "right", value: (r) => num(r.cogs) },
                { header: "Profit", flex: 1, align: "right", value: (r) => num(r.profit) },
                { header: "Margin %", flex: 0.8, align: "right", value: (r) => pct(r.margin) },
                { header: "Payment", flex: 0.8, value: (r) => int(r.payment_method) },
                { header: "Cashier", flex: 1, value: (r) => int(r.cashier) },
              ],
              shown,
            );
            // TOTAL row (full period, not just shown rows)
            ensureSpace(doc, 40);
            doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
            doc.text(
              `TOTAL — Gross: ${num(totals.gross)}   Discount: ${num(totals.discounts || 0)}   Net: ${num(totals.net)}   COGS: ${num(totals.cogs)}   Profit: ${num(totals.profit)}   Margin: ${totals.net > 0 ? Math.round((totals.profit / totals.net) * 1000) / 10 : 0}%`,
              left,
              doc.y,
              { width: contentWidth },
            );
            if (rows.length > shown.length) {
              doc.font("Helvetica").fontSize(8).fillColor(MUTED);
              doc.text(
                `Showing latest ${shown.length} of ${rows.length} orders — export Excel for the full ledger.`,
                left,
                doc.y + 2,
                { width: contentWidth },
              );
            }
            doc.moveDown(1);
          }

          if (payload.variants) {
            sectionTable(
              doc,
              "Variant Profitability (Top 50)",
              [
                { header: "Product", flex: 2, value: (r) => int(r.product_name) },
                { header: "Variant", flex: 1.2, value: (r) => int(r.size_name) },
                { header: "Units", flex: 0.8, align: "right", value: (r) => int(r.units) },
                { header: "Net Sales", flex: 1.2, align: "right", value: (r) => num(r.net_sales) },
                { header: "COGS", flex: 1.2, align: "right", value: (r) => num(r.cogs) },
                { header: "Profit", flex: 1.2, align: "right", value: (r) => num(r.profit) },
                { header: "Margin %", flex: 0.9, align: "right", value: (r) => pct(r.margin) },
              ],
              payload.variants.rows,
            );
          }

          if (payload.ingredients) {
            sectionTable(
              doc,
              "Ingredient Profitability (Top 50)",
              [
                { header: "Ingredient", flex: 2, value: (r) => int(r.ingredient_name) },
                { header: "Stock Value", flex: 1.2, align: "right", value: (r) => num(r.stock_value) },
                { header: "Restocks", flex: 0.9, align: "right", value: (r) => int(r.restock_count) },
                { header: "Total Spend", flex: 1.2, align: "right", value: (r) => num(r.total_spend) },
                { header: "Waste", flex: 1.2, align: "right", value: (r) => num(r.total_waste) },
              ],
              payload.ingredients.rows,
            );
          }

          if (payload.trend) {
            sectionTable(
              doc,
              "Daily Trend",
              [
                { header: "Date", flex: 1.4, value: (d) => shortDate(d.date) },
                { header: "Gross", flex: 1.2, align: "right", value: (d) => num(d.gross) },
                { header: "Net", flex: 1.2, align: "right", value: (d) => num(d.revenue) },
                { header: "COGS", flex: 1.2, align: "right", value: (d) => num(d.cogs) },
                { header: "Profit", flex: 1.2, align: "right", value: (d) => num(d.profit) },
                { header: "Orders", flex: 0.9, align: "right", value: (d) => int(d.orders) },
              ],
              payload.trend,
            );
          }

          if (payload.waste) {
            sectionTable(
              doc,
              "Waste Details (Latest 200)",
              [
                { header: "Date", flex: 1.4, value: (r) => shortDate(r.logged_at) },
                { header: "Ingredient", flex: 2, value: (r) => int(r.ingredient_name) },
                { header: "Type", flex: 1, value: (r) => int(r.type) },
                { header: "Qty Lost", flex: 1, align: "right", value: (r) => int(r.quantity_lost) },
                { header: "Cost Lost", flex: 1.2, align: "right", value: (r) => num(r.total_cost_lost) },
                { header: "Notes", flex: 2.4, value: (r) => int(r.notes) },
              ],
              payload.waste.rows || [],
            );
          }

          // ── Footer: page numbers ──
          // NOTE: footer y sits below the bottom margin, which would make
          // pdfkit auto-paginate a blank page per footer. Shrink the margin
          // during the footer pass so the write stays on its own page.
          const range = doc.bufferedPageRange();
          for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);
            doc.page.margins.bottom = 20;
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor(MUTED)
              .text(
                `Abbey's Kitchenette · Page ${i + 1} of ${range.count}`,
                left,
                doc.page.height - 36,
                { width: contentWidth, align: "center" },
              );
          }

          doc.end();
        } catch (err) {
          reject(err);
        }
      },
      () => reject(new Error("PDF export not available on server")),
    );
  });
}
