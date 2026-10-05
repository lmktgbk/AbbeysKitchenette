import { useState, useEffect } from "react";

/**
 * useReducedMotion — prefers-reduced-motion media query hook (admin).
 *
 * WHY it exists: charts (recharts JS-driven animation can't be killed by CSS)
 * and any future motion need a JS signal. Decorative CSS motion is handled by
 * the global media query in index.css; this hook covers JS-driven animation.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    // Listen to preference changes while mounted and remove the same listener on cleanup.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
