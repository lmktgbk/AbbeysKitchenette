import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { describe, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({ preview: undefined }));
// Observe the real form's draft initialization without mounting browser dialogs
// or issuing uploads. Cached details deliberately remain present in create mode.
vi.mock("../../client/src/components/ui/dialog.jsx", () => {
  const passthrough = props => props.children;
  return { Dialog: passthrough, DialogContent: passthrough, DialogHeader: passthrough,
    DialogTitle: passthrough, DialogDescription: passthrough, DialogFooter: passthrough, DialogClose: () => null };
});
vi.mock("../../client/src/features/products/components/ImageUpload.jsx", () => ({ default: props => {
  observed.preview = props.previewUrl;
  return null;
} }));
import ProductFormModal from "../../client/src/features/products/components/ProductFormModal.jsx";

const cachedProduct = { product_id: "previous-edit", product_name: "Tea", image_url: "https://example.test/old.png", variants: [] };
function render(isEditMode) {
  return renderToStaticMarkup(<ProductFormModal open isEditMode={isEditMode} product={cachedProduct}
    onOpenChange={() => {}} onSubmit={() => {}} />);
}
describe("product image draft boundaries", () => {
  it("starts Add empty after Edit even when cached product details remain", () => {
    render(true);
    expect(observed.preview).toBe(cachedProduct.image_url);
    render(false);
    expect(observed.preview).toBeNull();
  });
  it("still loads the existing image when editing", () => {
    render(false);
    render(true);
    expect(observed.preview).toBe(cachedProduct.image_url);
  });
});
