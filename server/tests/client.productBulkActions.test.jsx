import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ buttons: [] }));
// Capture our component's callbacks without relying on Radix's browser lifecycle.
vi.mock("../../client/src/components/ui/dialog.jsx", () => {
  const passthrough = props => props.children;
  return { Dialog: passthrough, DialogContent: passthrough, DialogHeader: passthrough,
    DialogTitle: passthrough, DialogFooter: passthrough, DialogClose: () => null };
});
vi.mock("../../client/src/components/ui/button.jsx", () => ({ Button: props => { h.buttons.push(props); return null; } }));
vi.mock("../../client/src/components/ui/icon.jsx", () => ({ default: () => null }));
vi.mock("../../client/src/components/ui/ImagePlaceholder.jsx", () => ({ default: () => null }));
import ProductDetailModal from "../../client/src/features/products/components/ProductDetailModal.jsx";
import { bulkVariantActions } from "../../client/src/features/products/product.utils.js";

const enabled = { variant_id: 1, size_name: "Small", price: 50, is_available: true,
  is_manually_deactivated: false, is_stock_sufficient: true, recipes: [] };
const disabled = { ...enabled, variant_id: 2, size_name: "Medium", is_available: false, is_manually_deactivated: true };
const lowStock = { ...enabled, variant_id: 3, size_name: "Large", is_available: false, is_stock_sufficient: false };
const product = { product_id: "fixture", product_name: "Tea", is_available: true, variants: [enabled, disabled, lowStock] };
beforeEach(() => { h.buttons = []; });
function render(overrides = {}) {
  const props = { product, detail: product, open: true, onOpenChange: vi.fn(), onActivate: vi.fn(),
    onDeactivate: vi.fn(), onDelete: vi.fn(), ...overrides };
  renderToStaticMarkup(<ProductDetailModal {...props} />);
  return props;
}
function button(label) {
  return h.buttons.find(props => React.Children.toArray(props.children).some(child => child === label));
}
describe("bulk product visibility and confirmation lifecycle", () => {
  it("shows the assigned subcategory and safely renders multiline descriptions", () => {
    const detail = { ...product, category_name: "Beverages", subcategory_name: "Coffee", description: "Fresh coffee\n<script>unsafe()</script>" };
    const markup = renderToStaticMarkup(<ProductDetailModal product={detail} detail={detail} open onOpenChange={() => {}} />);
    expect(markup).toContain("Coffee");
    expect(markup).not.toContain("Beverages");
    expect(markup).toContain("Fresh coffee\n&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("whitespace-pre-wrap");
    expect(markup.indexOf("Description")).toBeLessThan(markup.indexOf(">Variants<"));
  });
  it.each([
    ["Beverages", null, "Beverages"], [null, "Coffee", "Coffee"], [null, null, null],
  ])("handles missing category relations (%s / %s)", (category_name, subcategory_name, expected) => {
    const detail = { ...product, category_name, subcategory_name, description: "   " };
    const markup = renderToStaticMarkup(<ProductDetailModal product={detail} detail={detail} open onOpenChange={() => {}} />);
    expect(markup).toContain("No description provided");
    expect(markup).not.toContain(" › ");
    if (expected) expect(markup).toContain(expected);
  });
  it("retains long descriptions with wrapping rather than truncating their content", () => {
    const description = "longword".repeat(500);
    const detail = { ...product, description };
    const markup = renderToStaticMarkup(<ProductDetailModal product={detail} detail={detail} open onOpenChange={() => {}} />);
    expect(markup).toContain(description);
    expect(markup).toContain("[overflow-wrap:anywhere]");
  });
  it("offers both actions for mixed manual settings and low stock", () => {
    render();
    expect(button("Activate All").disabled).toBe(false);
    expect(button("Deactivate All").disabled).toBe(false);
  });
  it("disables no-op bulk actions without concealing the other action", () => {
    expect(bulkVariantActions({ ...product, variants: [enabled] })).toEqual({ canActivate: false, canDeactivate: true });
    expect(bulkVariantActions({ ...product, is_available: false, variants: [disabled] })).toEqual({ canActivate: true, canDeactivate: false });
    expect(bulkVariantActions({ ...product, variants: [] })).toEqual({ canActivate: false, canDeactivate: false });
  });
  it("stock shortage does not remove bulk deactivation", () => {
    expect(bulkVariantActions({ ...product, variants: [enabled, lowStock] })).toEqual({ canActivate: true, canDeactivate: true });
  });
  it("disables actions until full detail has loaded", () => {
    render({ detail: null, loading: true });
    expect(button("Activate All").disabled).toBe(true);
    expect(button("Deactivate All").disabled).toBe(true);
  });
  it.each(["Activate All", "Deactivate All", "Delete"])("keeps the confirmation container mounted during %s", async label => {
    let finish;
    const action = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const props = render({ onActivate: action, onDeactivate: action, onDelete: action });
    const pending = button(label).onClick();
    expect(action).toHaveBeenCalledWith(product);
    expect(props.onOpenChange).not.toHaveBeenCalled();
    finish(true); await pending;
    expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
  it.each([false, undefined])("leaves details open after cancellation or handled failure (%s)", async result => {
    const props = render({ onActivate: vi.fn().mockResolvedValue(result) });
    await button("Activate All").onClick();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
