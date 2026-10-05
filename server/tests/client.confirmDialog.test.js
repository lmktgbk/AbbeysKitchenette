import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { fire } = vi.hoisted(() => ({ fire: vi.fn() }));
vi.mock("../../client/node_modules/sweetalert2/dist/sweetalert2.all.js", () => ({ default: { fire } }));
vi.mock("../../client/node_modules/sweetalert2/dist/sweetalert2.esm.all.js", () => ({ default: { fire } }));
import { confirm, confirmWithReason, confirmWithLossOption } from "../../client/src/components/alerts/ConfirmDialog.jsx";

// Capture the renderer contract without mounting a browser or executing destructive callbacks.
beforeEach(() => {
  fire.mockReset().mockResolvedValue({ isConfirmed: false });
  vi.stubGlobal("document", { createElement: () => ({ remove: vi.fn() }), head: { appendChild: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

const hostile = "<img src=x onerror=\"alert(1)\"> & 'quoted'";
const encoded = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;';

describe("confirmation dialogs treat caller content as text", () => {
  it("escapes stored names and notes while preserving the static layout", async () => {
    expect(await confirm({ title: hostile, message: hostile, note: hostile, confirmLabel: hostile, cancelLabel: hostile })).toBe(false);
    const options = fire.mock.calls[0][0];
    expect(options.titleText).toBe(hostile);
    expect(options.title).toBeUndefined();
    expect(options.html).toContain(encoded);
    expect(options.html).not.toContain('<img');
    expect(options.confirmButtonText).toBe(encoded);
    expect(options.cancelButtonText).toBe(encoded);
    expect(options.html).toContain('<p style=');
  });
  it("uses the text option for a message without a note", async () => {
    await confirm({ title: "Confirm", message: hostile });
    expect(fire.mock.calls[0][0]).toMatchObject({ text: hostile, html: undefined });
  });
  it("contains quote-based attribute injection in reason values", async () => {
    const value = 'x" autofocus onfocus="alert(1)';
    await confirmWithReason({ title: hostile, message: hostile, reasons: [{ value, label: hostile }] });
    const options = fire.mock.calls[0][0];
    expect(options.html).toContain('data-value="x&quot; autofocus onfocus=&quot;alert(1)"');
    expect(options.html).toContain(encoded);
    expect(options.html).not.toContain('<img');
    expect(options.titleText).toBe(hostile);
  });
  it("keeps ordinary punctuation and Unicode readable through entity decoding", async () => {
    await confirm({ title: "Confirm", message: "Abbey's Café & Tea 🧋", note: "<b>literal</b> &amp;" });
    const html = fire.mock.calls[0][0].html;
    expect(html).toContain("Abbey&#39;s Café &amp; Tea 🧋");
    expect(html).toContain("&lt;b&gt;literal&lt;/b&gt; &amp;amp;");
  });
  it("escapes order labels in the loss-option dialog", async () => {
    expect(await confirmWithLossOption({ orderNumber: hostile })).toEqual({ confirmed: false, loss_option: null });
    expect(fire.mock.calls[0][0].html).toContain('<strong>' + encoded + '</strong>');
  });
  it("retains the confirmation result contract", async () => {
    fire.mockResolvedValueOnce({ isConfirmed: true });
    expect(await confirm({ title: "Confirm", message: "Continue?" })).toBe(true);
  });
});
