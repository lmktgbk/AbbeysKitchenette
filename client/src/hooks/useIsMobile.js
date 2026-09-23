/**
 * useIsMobile — browser-only viewport derivation (Rule of Thumb: useState, smallest scope).
 * WHY a hook, not global state: only AdminLayout/Header need it, and matchMedia avoids
 * re-rendering every Zustand subscriber on each resize tick.
 * @param {number} breakpoint - max width in px treated as mobile (default 768).
 * @returns {boolean} true when viewport matches mobile.
 */
import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    // Initial value already set lazily above; subscribe only for changes here
    // (avoids set-state-in-effect; matchMedia fires on crossing the breakpoint).
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
