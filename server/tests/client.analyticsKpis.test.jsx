import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it } from "vitest";
import AnalyticsKpis from "../../client/src/features/analytics/components/AnalyticsKpis.jsx";

it("renders nine keyboard-accessible cards and fills the profit card without dashboard notes or nested links", () => {
  const html = renderToStaticMarkup(<AnalyticsKpis kpis={{ retainedPayments: 85, netProfit: 166 }} />);
  expect(html).toContain("Retained Payments");
  expect(html).toContain("View Retained Payments breakdown");
  expect((html.match(/aria-haspopup="dialog"/g) ?? []).length).toBe(9);
  expect(html).toContain("xl:row-span-2");
  expect(html).toContain("col-span-full");
  expect(html).not.toContain("Operating expenses are not included");
  expect(html).not.toContain(">Details<");
  expect(html).toContain("Ingredient losses");
  expect((html.match(/type-caption/g) ?? []).length).toBe(9);
});
