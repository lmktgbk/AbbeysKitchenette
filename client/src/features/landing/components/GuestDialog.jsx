import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../guestDialog.css";

export default function GuestDialog({ children, label, className, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    // Native modal behavior provides focus containment and an inert background, including screen readers.
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={ref} aria-label={label} aria-modal="true" aria-busy={busy} className={`guest-dialog ${className}`}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        // Keep Tab at the modal boundary instead of letting browser chrome consume the next focus stop.
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        }
      }}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      {children}
    </dialog>, document.body,
  );
}
