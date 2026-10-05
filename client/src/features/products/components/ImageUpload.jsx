import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { PRODUCT_IMAGE_ACCEPT } from "../productValidation";
import { prepareProductImage } from "../imagePayload";

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
 * - describedBy: string — ID of the form's shared image-guidelines note
 * - onProcessingChange: (boolean) => void — prevents saving an unfinished selection
 */
export default function ImageUpload({ onChange, previewUrl, className, describedBy, onProcessingChange }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);

  /** Opens the hidden file input; this component does not upload files. */
  function handleClick() {
    inputRef.current?.click();
  }

  /** Only the latest completed selection may replace the draft. Closing/removing
   * an image invalidates in-flight work, preventing a late decode from restoring it.
   */
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      // Reset the picker so selecting the same rejected file triggers change again.
      // Leave the existing saved/draft preview intact when the new selection is invalid.
      e.target.value = "";
      const version = ++selection.current;
      setError(""); setNotice(""); setProcessing(true);
      onProcessingChange?.(true);
      try {
        const result = await prepareProductImage(file);
        if (selection.current !== version) return;
        onChange(result.file);
        setNotice(result.resized ? "Image resized automatically. Proportions preserved." : "");
      } catch (error) {
        if (selection.current === version) setError(error.message || "Image could not be prepared. Choose another image.");
      } finally {
        if (selection.current === version) {
          setProcessing(false);
          onProcessingChange?.(false);
        }
      }
    }
  }

  /** Clears selection without reopening the picker; stored-image deletion occurs on a successful save. */
  function handleRemove(e) {
    e.stopPropagation();
    selection.current++;
    setProcessing(false); setNotice("");
    onProcessingChange?.(false);
    setError("");
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
        {/* Match the product card's square cover frame; image height cannot grow the form. */}
        <button
          type="button"
          disabled={processing}
          onClick={handleClick}
          aria-label={previewUrl ? "Replace product image" : "Upload product image"}
          aria-describedby={describedBy}
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
              <span className="text-xs text-muted-foreground">{processing ? "Preparing image..." : "Click to upload image"}</span>
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
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {(notice || (processing && previewUrl)) && <p role="status" className="mt-1 text-xs text-muted-foreground">{processing ? "Preparing image..." : notice}</p>}
    </div>
  );
}
