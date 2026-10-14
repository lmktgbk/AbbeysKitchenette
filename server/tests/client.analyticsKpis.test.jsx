import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it } from "vitest";
import AnalyticsKpis from "../../client/src/features/analytics/components/AnalyticsKpis.jsx";

it("renders nine cards with a tall desktop profit card and retained-payment details control", () => {
  const html = renderToStaticMarkup(<AnalyticsKpis kpis={{ retainedPayments: 85, netProfit: 166 }} />);
  expect(html).toContain("Retained Payments");
  expect(html).toContain("View retained payment details");
  expect(html).toContain("xl:row-span-2");
  expect(html).toContain("col-span-full");
  expect(html).toContain("Operating expenses are not included");
  expect((html.match(/type-caption/g) ?? []).length).toBe(9);
});
