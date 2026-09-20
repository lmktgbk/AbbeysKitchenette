import { useState, useEffect, useCallback } from "react";

/**
 * usePopoverAlign — smart-flip popup placement shared by the filter
 * calendar popovers (DateRangeFilter, DatePicker).
 *
 * Measures the trigger on open: the panel grows away from the nearest
 * viewport edge (left-side triggers open right, right-side triggers
 * open left) and re-checks on window resize while open.
 *
 * @param {React.RefObject} ref - wrapper element ref (trigger + panel)
 * @param {boolean} open - whether the popup is open
 * @param {number} [panelWidth=288] - popup width in px (w-72)
 * @returns {"left"|"right"} - Tailwind anchor side for the panel
 */
export default function usePopoverAlign(ref, open, panelWidth = 288) {
  const [align, setAlign] = useState("right");

  const updateAlign = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 16;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;
    if (spaceLeft < panelWidth + margin && spaceRight >= panelWidth + margin) {
      setAlign("left");
    } else if (spaceRight < panelWidth + margin && spaceLeft >= panelWidth + margin) {
      setAlign("right");
    } else {
      setAlign(spaceLeft >= spaceRight ? "right" : "left");
    }
  }, [ref, panelWidth]);

  useEffect(() => {
    if (!open) return;
    updateAlign();
    window.addEventListener("resize", updateAlign);
    return () => window.removeEventListener("resize", updateAlign);
  }, [open, updateAlign ]);

  return align;
}
