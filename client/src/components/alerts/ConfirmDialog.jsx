import Swal from "sweetalert2";
import { toast } from "sonner";

const VARIANTS = {
    danger: { confirmColor: "var(--destructive)", icon: "warning" },
    warning: { confirmColor: "var(--warning)", icon: "warning" },
    success: { confirmColor: "var(--success)", icon: "success" },
    info: { confirmColor: "var(--info)", icon: "info" },
};

const DEFAULT_REASONS = [
    "Wrong order",
    "Customer changed mind",
    "Duplicate order",
    "Out of stock",
    "Other",
];

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
 * @param {Function} [opts.onConfirm] - async callback. Dialog stays open with loading text until it resolves.
 * @param {string} [opts.loadingText] - text shown on confirm button while onConfirm is running
 * @returns {Promise<boolean>} - true if confirmed (and onConfirm succeeded, if provided)
 */
export async function confirm({ title, message, note, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger", onConfirm, loadingText }) {
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
        ...(onConfirm && {
            preConfirm: async () => {
                const btn = Swal.getConfirmButton();
                btn.disabled = true;
                btn.textContent = loadingText || confirmLabel;
                try {
                    await onConfirm();
                } catch (err) {
                    Swal.close();
                    toast.error(err?.response?.data?.message || "Operation failed");
                    return false;
                }
            },
            allowOutsideClick: () => !Swal.isLoading(),
        }),
    });
    return result.isConfirmed;
}

/**
 * SweetAlert2 confirmation with predefined cancellation reasons.
 * Shows clickable reason chips. "Other" reveals a textarea.
 *
 * @param {Object} opts
 * @param {string} opts.title - Dialog title
 * @param {string} opts.message - Main message text
 * @param {string[]} [opts.reasons] - Predefined reasons (defaults to DEFAULT_REASONS)
 * @param {string} [opts.confirmLabel] - Confirm button text
 * @param {string} [opts.cancelLabel] - Cancel button text
 * @param {Function} [opts.onConfirm] - async callback receiving { reason, custom_reason }. Modal stays open with loading text until it resolves.
 * @param {string} [opts.loadingText] - text shown on confirm button while onConfirm is running
 * @returns {Promise<{ confirmed: boolean, reason: string, custom_reason: string }>}
 */
export async function confirmWithReason({ title, message, reasons = DEFAULT_REASONS, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, loadingText }) {
    let selectedValue = "";
    let customReason = "";

    const normalizedReasons = reasons.map((r) =>
        typeof r === "string" ? { value: r, label: r } : r
    );
    const isOther = (val) => val === "other";

    const htmlContent = `
    <p style="text-align:center; margin:0 0 12px 0;">${message}</p>
    <div id="reason-chips" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;">
      ${normalizedReasons.map((r) => `
        <button type="button" class="reason-chip" data-value="${r.value}"
          style="padding:6px 14px; border-radius:20px; border:1.5px solid var(--border); background:var(--background);
                 color:var(--foreground); font-size:13px; cursor:pointer; transition:all 0.15s;">
          ${r.label}
        </button>
      `).join("")}
    </div>
    <div id="other-input" style="display:none; margin-top:8px;">
      <textarea id="custom-reason" rows="2" placeholder="Enter reason..."
        style="width:100%; padding:8px 12px; border:1.5px solid var(--border); border-radius:8px;
               background:var(--background); color:var(--foreground); font-size:13px; resize:none; box-sizing:border-box;">
      </textarea>
    </div>
  `;

    const styleTag = document.createElement("style");
    styleTag.textContent = `
      .reason-chip:hover { border-color: var(--primary) !important; background: var(--primary/10) !important; }
      .reason-chip.active { border-color: var(--primary) !important; background: var(--primary) !important; color: var(--card) !important; font-weight:600; }
    `;
    document.head.appendChild(styleTag);

    const result = await Swal.fire({
        title,
        html: htmlContent,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: confirmLabel,
        cancelButtonText: cancelLabel,
        confirmButtonColor: "var(--destructive)",
        reverseButtons: true,
        background: "var(--card)",
        color: "var(--foreground)",
        didOpen: () => {
            const popup = Swal.getPopup();
            const chips = popup.querySelectorAll(".reason-chip");
            const otherInput = popup.querySelector("#other-input");

            chips.forEach((chip) => {
                chip.addEventListener("click", () => {
                    selectedValue = chip.dataset.value;
                    chips.forEach((c) => c.classList.remove("active"));
                    chip.classList.add("active");

                    if (isOther(selectedValue)) {
                        otherInput.style.display = "block";
                    } else {
                        otherInput.style.display = "none";
                        customReason = "";
                    }
                });
            });
        },
        preConfirm: async () => {
            if (!selectedValue) {
                Swal.showValidationMessage("Please select a reason");
                return false;
            }
            if (isOther(selectedValue)) {
                const textarea = Swal.getPopup().querySelector("#custom-reason");
                const text = textarea?.value?.trim();
                if (!text) {
                    Swal.showValidationMessage("Please enter a reason");
                    return false;
                }
                customReason = text;
            }

            const reasonPayload = isOther(selectedValue)
                ? { reason: "other", custom_reason: customReason }
                : { reason: selectedValue, custom_reason: "" };

            if (onConfirm) {
                const btn = Swal.getConfirmButton();
                btn.disabled = true;
                btn.textContent = loadingText || confirmLabel;
                try {
                    await onConfirm(reasonPayload);
                } catch (err) {
                    Swal.close();
                    toast.error(err?.response?.data?.message || "Operation failed");
                    return false;
                }
            }

            return true;
        },
        ...(onConfirm && { allowOutsideClick: () => !Swal.isLoading() }),
    });

    styleTag.remove();

    if (!result.isConfirmed) {
        return { confirmed: false, reason: "", custom_reason: "" };
    }
    if (isOther(selectedValue)) {
        return { confirmed: true, reason: "other", custom_reason: customReason };
    }
    return { confirmed: true, reason: selectedValue, custom_reason: "" };
}

/**
 * Confirmation dialog for cancelling a Preparing order.
 * Shows two options: No Loss (full restore + refund) or With Loss (partial restore + LossRecords).
 *
 * @param {Object} opts
 * @param {string} opts.orderNumber - Order number for display
 * @returns {Promise<{ confirmed: boolean, loss_option: "no_loss" | "with_loss" | null }>}
 */
export async function confirmWithLossOption({ orderNumber }) {
    let selectedOption = null;

    const htmlContent = `
    <p style="text-align:center; margin:0 0 12px 0;">
      Order <strong>${orderNumber}</strong> is being prepared.<br/>
      How do you want to handle cancellation?
    </p>
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
      <button type="button" class="loss-option" data-option="no_loss"
        style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:8px; border:1.5px solid var(--border);
               background:var(--background); color:var(--foreground); font-size:13px; cursor:pointer; text-align:left; transition:all 0.15s;">
        <span style="font-size:20px;">🔄</span>
        <div>
          <div style="font-weight:600;">No Loss</div>
          <div style="font-size:12px; color:var(--muted-foreground);">Restore all ingredients, full refund</div>
        </div>
      </button>
      <button type="button" class="loss-option" data-option="with_loss"
        style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:8px; border:1.5px solid var(--border);
               background:var(--background); color:var(--foreground); font-size:13px; cursor:pointer; text-align:left; transition:all 0.15s;">
        <span style="font-size:20px;">📉</span>
        <div>
          <div style="font-weight:600;">With Loss</div>
          <div style="font-size:12px; color:var(--muted-foreground);">Restore unchecked items only, record losses</div>
        </div>
      </button>
    </div>
  `;

    const styleTag = document.createElement("style");
    styleTag.textContent = `
      .loss-option:hover { border-color: var(--primary) !important; background: var(--primary/10) !important; }
      .loss-option.active { border-color: var(--primary) !important; background: var(--primary) !important; color: var(--card) !important; font-weight:600; }
      .loss-option.active .loss-desc { color: var(--card) !important; opacity:0.9; }
    `;
    document.head.appendChild(styleTag);

    const result = await Swal.fire({
        title: "Cancel Order?",
        html: htmlContent,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Confirm Cancellation",
        cancelButtonText: "Keep Order",
        confirmButtonColor: "var(--destructive)",
        reverseButtons: true,
        background: "var(--card)",
        color: "var(--foreground)",
        didOpen: () => {
            const popup = Swal.getPopup();
            const options = popup.querySelectorAll(".loss-option");
            options.forEach((opt) => {
                opt.addEventListener("click", () => {
                    selectedOption = opt.dataset.option;
                    options.forEach((o) => o.classList.remove("active"));
                    opt.classList.add("active");
                    Swal.getConfirmButton().disabled = false;
                });
            });
            Swal.getConfirmButton().disabled = true;
        },
        preConfirm: () => {
            if (!selectedOption) {
                Swal.showValidationMessage("Please select an option");
                return false;
            }
            return true;
        },
    });

    styleTag.remove();
    return { confirmed: result.isConfirmed, loss_option: result.isConfirmed ? selectedOption : null };
}
