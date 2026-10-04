import { createElement, useState } from "../../client/node_modules/react/index.js";
import { renderToString } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it } from "vitest";
import { useResettableState } from "../../client/src/hooks/useResettableState.js";

it("preserves a changed page in its scope and resets before rendering new filters", () => {
  const observed = [];
  function Harness() {
    const [phase, setPhase] = useState(0);
    const [page, setPage] = useResettableState(1, [phase < 2 ? "all" : "cash"]);
    observed.push([phase, page]);
    if (phase === 0) { setPage(3); setPhase(1); }
    if (phase === 1) setPhase(2);
    return createElement("span", null, page);
  }
  expect(renderToString(createElement(Harness))).toBe("<span>1</span>");
  expect(observed).toContainEqual([1, 3]); expect(observed).toContainEqual([2, 1]);
});
it("retains the React setter identity and supports functional draft updates", () => {
  let originalSetter;
  function Harness() {
    const [phase, setPhase] = useState(0);
    const [value, setValue] = useResettableState({ quantity: 1 }, ["same"]);
    if (phase === 0) {
      originalSetter = setValue; setValue(previous => ({ quantity: previous.quantity + 2 })); setPhase(1);
    } else expect(setValue).toBe(originalSetter);
    return createElement("span", null, value.quantity);
  }
  expect(renderToString(createElement(Harness))).toBe("<span>3</span>");
});
it("reinitializes dialog drafts when closed and reopened", () => {
  const observed = [];
  function Harness() {
    const [phase, setPhase] = useState(0);
    const open = phase !== 2;
    const [draft, setDraft] = useResettableState(() => "saved", [open]);
    observed.push([phase, draft]);
    if (phase === 0) { setDraft("unsaved"); setPhase(1); }
    else if (phase < 3) setPhase(phase + 1);
    return createElement("span", null, draft);
  }
  expect(renderToString(createElement(Harness))).toBe("<span>saved</span>");
  expect(observed).toContainEqual([1, "unsaved"]); expect(observed).toContainEqual([3, "saved"]);
});
