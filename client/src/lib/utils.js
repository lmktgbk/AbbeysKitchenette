/** utils — cn() class merger (clsx + tailwind-merge). WHY it exists: single dedupe point for conditional Tailwind classes; consumed app-wide. State: none. */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
