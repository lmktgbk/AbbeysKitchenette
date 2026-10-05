/**
 * Printer transports for the JP-58H (USB + Bluetooth SPP) on laptop + tablet.
 *
 * - "system": window.print() through the OS driver queue (laptop USB001 or
 *   Bluetooth COM8 on Windows; USB OTG + print-service app on Android).
 * - "rawbt": ESC/POS bytes handed to the RawBT app on Android, which owns
 *   the Bluetooth SPP socket Chrome can't open directly (PIN 0000).
 * - "webusb": experimental direct USB bulk transfer where Chrome claims it.
 */

/** Encodes raw printer bytes in bounded chunks to avoid oversized spread arguments. */
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Hand ESC/POS bytes to the RawBT app (Android Bluetooth). */
export function printViaRawBT(bytes) {
  const base64 = bytesToBase64(bytes);
  // Hand off to the installed app; navigation does not acknowledge physical print completion.
  window.location.href = `rawbt:base64,${base64}`;
}

/** RawBT intent fallback for Android Chrome when the scheme is blocked. */
export function printViaRawBTIntent(bytes) {
  const base64 = encodeURIComponent(bytesToBase64(bytes));
  window.location.href =
    `intent://print#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;` +
    `S.data=${base64};end`;
}

/** Download the job so CaysnPrinter / vendor apps can open it. */
export function downloadEscposJob(bytes, filename = "receipt-escpos.bin") {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the URL briefly available for the download handoff, then release its browser allocation.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Experimental WebUSB bulk transfer (Chrome desktop/Android where the OS
 * hasn't claimed the printer). Returns true after transferOut resolves;
 * this is not confirmation of physical print completion.
 */
export async function printViaWebUSB(bytes) {
  if (!("usb" in navigator)) return false;
  // Filter by USB printer class/subclass. The picker is not restricted to a particular vendor/product.
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 7, subclassCode: 1 }],
  });
  await device.open();
  try {
    if (device.configuration == null) await device.selectConfiguration(1);
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const out = iface.alternate.endpoints.find((e) => e.direction === "out");
    if (!out) return false;
    await device.transferOut(out.endpointNumber, bytes);
    return true;
  } finally {
    try {
      await device.close();
    } catch {
      // Device loss can make close fail; preserve the original transfer result or exception.
    }
  }
}
