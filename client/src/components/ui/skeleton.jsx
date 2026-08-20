import { cn } from "@/lib/utils";

/**
 * Skeleton — loading placeholder with pulse animation.
 * Use with Tailwind utility classes to set dimensions.
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
