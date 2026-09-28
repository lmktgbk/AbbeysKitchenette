/**
 * B/W logo rasterizer for 58mm ESC/POS (JP-58H: 384 dots printable).
 *
 * Loads the bundled receipt logo, downscales to the dot width, thresholds
 * to 1-bit, and packs rows for the GS v 0 raster command in escpos.js.
 * Logo OFF stays a valid choice — this only runs when printing with logo on.
 */

import faviconUrl from "@/assets/favicon.png";

export const DOT_WIDTH_58MM = 384;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Returns { width, height, data } with MSB-first packed bits (1 = black dot)
 * or null when the logo can't load (caller prints text-only instead).
 */
export async function loadLogoRaster(maxWidth = DOT_WIDTH_58MM, maxHeight = 160) {
  try {
    const img = await loadImage(faviconUrl);
    const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    // 58mm raster rows must be byte-aligned for GS v 0.
    const width = Math.ceil(w / 8) * 8;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, h);
    const dx = Math.round((width - w) / 2);
    ctx.drawImage(img, dx, 0, w, h);

    const { data } = ctx.getImageData(0, 0, width, h);
    const packed = new Uint8Array((width / 8) * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        // Luma threshold keeps the mono logo crisp at 80-90mm/s.
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < 128) packed[(y * width + x) >> 3] |= 0x80 >> (x & 7);
      }
    }
    return { width, height: h, data: Array.from(packed) };
  } catch {
    return null;
  }
}
