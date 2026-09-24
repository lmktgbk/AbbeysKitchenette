/** PasswordInput — password field with eye show/hide toggle. WHY it exists: single reuse point for all password/confirm/PIN fields so eye styling, a11y and padding stay consistent; consumed by auth/profile/staff forms. State: local [show]. */
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import Icon from "./icon";

export const PasswordInput = forwardRef(function PasswordInput(
  { className, autoComplete = "off", ariaLabel = "password", ...props },
  ref
) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? `Hide ${ariaLabel}` : `Show ${ariaLabel}`}
        aria-pressed={show}
        title={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <Icon name={show ? "eyeOff" : "eye"} size={16} />
      </button>
    </div>
  );
});
