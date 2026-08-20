import Swal from "sweetalert2";

const VARIANTS = {
    danger: { confirmColor: "var(--destructive)", icon: "warning" },
    warning: { confirmColor: "var(--warning)", icon: "warning" },
    success: { confirmColor: "var(--success)", icon: "success" },
    info: { confirmColor: "var(--info)", icon: "info" },
};

/**
 * SweetAlert2 confirmation dialog.
 *
 * @param {Object} opts
 * @param {string} opts.title - Dialog title
 * @param {string} opts.message - Main message text
 * @param {string} [opts.note] - Optional highlighted note (rendered in a muted box)
 * @param {string} [opts.confirmLabel] - Confirm button text
 * @param {string} [opts.cancelLabel] - Cancel button text
 * @param {string} [opts.variant] - danger | warning | success | info
 * @returns {Promise<boolean>} - true if confirmed
 */
export async function confirm({ title, message, note, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger" }) {
    const v = VARIANTS[variant] || VARIANTS.danger;

    const hasNote = !!note;
    const html = hasNote
        ? `<p style="text-align:center; margin: 0 0 8px 0;">${message}</p><div style="text-align:center; background: var(--muted); padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-top: 8px;">${note}</div>`
        : undefined;

    const result = await Swal.fire({
        title,
        html,
        text: hasNote ? undefined : message,
        icon: v.icon,
        showCancelButton: true,
        confirmButtonText: confirmLabel,
        cancelButtonText: cancelLabel,
        confirmButtonColor: v.confirmColor,
        reverseButtons: true,
        background: "var(--card)",
        color: "var(--foreground)",
    });
    return result.isConfirmed;
}