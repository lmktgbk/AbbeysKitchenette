import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ content: null, root: null }));
// Isolate our wrapper's restoration callbacks; the primitive's DOM lifecycle is checked in a browser.
vi.mock("../../client/node_modules/radix-ui/dist/index.mjs", () => ({ Dialog: {
  Root: (props) => { state.root = props; return props.open ? props.children : null; },
  Portal: (props) => props.children,
  Overlay: () => null,
  Content: (props) => { state.content = props; return props.children; },
  Title: "h2", Description: "p",
} }));
import { Dialog, DialogContent, DialogTitle } from "../../client/src/components/ui/dialog.jsx";

beforeEach(() => { state.content = null; state.root = null; });
afterEach(() => vi.unstubAllGlobals());
function render(props = {}) {
  return renderToStaticMarkup(<Dialog open onOpenChange={() => {}}><DialogContent {...props}><DialogTitle>Fixture</DialogTitle></DialogContent></Dialog>);
}
describe("controlled modal wrapper", () => {
  it("does not render closed content", () => {
    expect(renderToStaticMarkup(<Dialog open={false} onOpenChange={() => {}}><DialogContent>Private draft</DialogContent></Dialog>)).toBe("");
  });
  it("restores the focused opener without requiring a primitive Trigger", () => {
    const opener = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: opener });
    render();
    state.content.onOpenAutoFocus({});
    const event = { defaultPrevented: false, preventDefault: vi.fn() };
    state.content.onCloseAutoFocus(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(state.content["aria-modal"]).toBe("true");
  });
  it("respects caller-managed close focus", () => {
    const opener = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: opener });
    const close = vi.fn(event => { event.defaultPrevented = true; });
    render({ onCloseAutoFocus: close });
    state.content.onOpenAutoFocus({});
    state.content.onCloseAutoFocus({ defaultPrevented: false });
    expect(close).toHaveBeenCalledOnce();
    expect(opener.focus).not.toHaveBeenCalled();
  });
  it("does not focus an opener removed while the modal was open", () => {
    const opener = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: opener });
    render(); state.content.onOpenAutoFocus({}); opener.isConnected = false;
    const event = { defaultPrevented: false, preventDefault: vi.fn() };
    state.content.onCloseAutoFocus(event);
    expect(opener.focus).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
