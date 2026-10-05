import { useId, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { PRODUCT_IMAGE_ACCEPT, productImageError } from "../productValidation";

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
  const hintId = useId();
  const [error, setError] = useState("");

  /** Opens the hidden file input; this component does not upload files. */
  function handleClick() {
    inputRef.current?.click();
  }

  /** Reject obvious errors before creating a blob preview; decoded content is still checked by the API. */
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      const message = productImageError(file);
      setError(message);
      // Reset the picker so selecting the same rejected file triggers change again.
      // Leave the existing saved/draft preview intact when the new selection is invalid.
      e.target.value = "";
      if (message) return;
      onChange(file);
    }
  }

  /** Clears selection without reopening the picker; stored-image deletion occurs on a successful save. */
  function handleRemove(e) {
    e.stopPropagation();
    setError("");
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <div className="relative aspect-square w-full max-w-[240px] overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
        {/* Match the product card's square cover frame; image height cannot grow the form. */}
        <button
          type="button"
          onClick={handleClick}
          aria-label={previewUrl ? "Replace product image" : "Upload product image"}
          aria-describedby={hintId}
          className="absolute inset-0 flex w-full flex-col items-center justify-center gap-2 hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Product preview"
              className="absolute inset-0 h-full w-full rounded-lg object-cover p-2"
            />
          ) : (
            <>
              <Icon name="image" size={24} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Click to upload image</span>
            </>
          )}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove product image"
            className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
          >
            <Icon name="x" size={14} />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      <p id={hintId} className="mt-2 text-xs text-muted-foreground">
        JPG, PNG, WebP or GIF · Max 5 MB. Recommended: square, 1000 × 1000 px.
        Maximum 4096 × 4096 px. Non-square images are cropped in product cards.
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
