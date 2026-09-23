import { cn } from "@/lib/utils";

/** Skeleton — pulsing placeholder box. WHY it exists: reserves layout during loads to avoid shift; consumed with Tailwind sizing utilities. State: none. */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
