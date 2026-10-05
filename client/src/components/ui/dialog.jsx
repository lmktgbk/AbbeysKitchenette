import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

/** Caller-controlled modal. Radix owns focus trapping, Escape/outside dismissal,
 * screen-reader title/description links, and nested scroll-lock cleanup.
 */
function Dialog({ open, onOpenChange, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>;
}

/** Keep the existing layout/API while delegating modal lifecycle to the installed primitive. */
function DialogContent({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }) {
  const opener = useRef(null);

  function handleOpenAutoFocus(event) {
    // Callers open these dialogs without a Radix Trigger, so retain the actual focused opener.
    opener.current = document.activeElement;
    onOpenAutoFocus?.(event);
  }

  function handleCloseAutoFocus(event) {
    onCloseAutoFocus?.(event);
    if (!event.defaultPrevented && opener.current?.isConnected) {
      event.preventDefault();
      opener.current.focus();
    }
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0 duration-200" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4 py-4">
        <DialogPrimitive.Content
          aria-modal="true"
          className={cn(
            "pointer-events-auto w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto relative border border-border bg-card text-card-foreground rounded-xl p-6 animate-in fade-in-0 zoom-in-95 duration-200",
            className,
          )}
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 mb-4", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex justify-end gap-2 mt-6 pt-4 border-t border-border",
        className,
      )}
      {...props}
    />
  );
}

function DialogClose({ onClick, className, ...props }) {
  return (
    <button
      type="button"
      aria-label="Close dialog"
      onClick={onClick}
      className={cn(
        "absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      <Icon name="x" size={16} />
    </button>
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
};
