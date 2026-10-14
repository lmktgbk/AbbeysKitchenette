import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it, vi } from "vitest";
vi.mock("../../client/src/realtime/subscriptions.js", () => ({ useShiftsRealtime: () => {}, useOrdersRealtime: () => {} }));
vi.mock("../../client/src/features/shifts/query.js", () => ({
  useShiftSummary: () => ({ data: { data: {
    shift: { shift_id: "fixture", status: "closed", opener_name: "Justin", closer_name: "Liam", opened_at: "2026-10-14T08:00:00Z", closed_at: "2026-10-14T09:00:00Z", close_note: "Found ₱5\n<script>test</script>" },
    summary: { variance: 5, expected_cash: 1125, actual_cash: 1130 },
  } } }),
  useShiftOrders: () => ({ data: { data: { orders: [] } } }),
  useShiftIngredientUsage: () => ({ data: { data: {} } }),
}));
vi.mock("../../client/src/components/ui/dialog.jsx", () => {
  const pass = props => props.children;
  return { Dialog: pass, DialogContent: pass, DialogHeader: pass, DialogTitle: pass, DialogClose: () => null };
});
import ShiftDetailDrawer from "../../client/src/features/shifts/components/ShiftDetailDrawer.jsx";
it("renders saved difference notes, their author and multiline text safely", () => {
  const html = renderToStaticMarkup(<ShiftDetailDrawer open shiftId="fixture" />);
  expect(html).toContain("Difference note");
  expect(html).toContain("Found ₱5\n&lt;script&gt;test&lt;/script&gt;");
  expect(html).toContain("Recorded by Liam");
  expect(html).not.toContain("<script>");
});
