import { useRef } from "react";
import Icon from "@/components/ui/icon";

/**
 * ImageUpload
 *
 * File input with preview for product images.
 * Shows current image or placeholder, allows click-to-upload or drag.
 *
 * Props:
 * - value: string | null (current image URL)
 * - onChange: (file: File | null) => void
 * - previewUrl: string | null (derived preview URL from value or selected file)
 */
export default function ImageUpload({ value, onChange, previewUrl }) {
  const inputRef = useRef(null);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      onChange(file);
    }
  }

  function handleRemove(e) {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onClick={handleClick}
      className="group relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 transition-colors hover:border-muted-foreground/50"
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
