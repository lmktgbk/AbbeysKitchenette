import { useRef } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

/**
 * ImageUpload
 *
 * File input with preview for product images.
 * Opens the native file picker and delegates file/preview ownership to the product form.
 *
 * Props:
 * - onChange: (file: File | null) => void
 * - previewUrl: string | null (saved remote URL or parent-owned browser blob URL)
 * - className: string (additional classes for the container)
 */
export default function ImageUpload({ onChange, previewUrl, className }) {
  const inputRef = useRef(null);

  /** Opens the hidden file input; this component does not upload files. */
  function handleClick() {
    inputRef.current?.click();
  }

  /** Passes selection intent to the parent; file authenticity and size are checked by the API. */
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      onChange(file);
    }
  }

  /** Clears selection without reopening the picker; stored-image deletion occurs on a successful save. */
  function handleRemove(e) {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 transition-colors hover:border-muted-foreground/50",
        className
      )}
    >
      {previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt="Product preview"
            className="h-full w-full rounded-lg object-contain p-2"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Icon name="x" size={14} />
          </button>
        </>
      ) : (
        <>
          <Icon name="image" size={24} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Click to upload image
          </span>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
