import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * ImagePlaceholder
 *
 * Reusable image wrapper with graceful fallback.
 * Shows placeholder when src is null/empty or when the image fails to load.
 *
 * Props:
 * - src: string | null — image URL
 * - alt: string — alt text
 * - className: string — outer container styling
 * - fallbackIcon: string — lucide icon name (default: "imageOff")
 * - fallbackText: string — optional text below icon (default: "No Image")
 * - objectFit: "contain" | "cover" — how image fits the container (default: "contain")
 */
export default function ImagePlaceholder({
  src,
  alt = "",
  className,
  fallbackIcon = "imageOff",
  fallbackText = "No Image",
  objectFit = "contain",
}) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showImage = src && !errored;

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-muted/30", className)}>
      {showImage ? (
        <>
          {!loaded && (
            <Icon name={fallbackIcon} size={24} className="text-muted-foreground/40" />
          )}
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={cn(
              "absolute inset-0 h-full w-full p-2",
              objectFit === "cover" ? "object-cover" : "object-contain",
              loaded ? "opacity-100" : "opacity-0"
            )}
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 border-2 border-dashed border-border/60 rounded-lg m-1 p-3 text-muted-foreground/50">
          <Icon name={fallbackIcon} size={28} />
          {fallbackText && (
            <span className="text-xs font-medium">{fallbackText}</span>
          )}
        </div>
      )}
    </div>
  );
}
