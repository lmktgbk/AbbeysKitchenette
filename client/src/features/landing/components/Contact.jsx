import Icon from "@/components/ui/icon";

/**
 * Contact
 * Direct call/email links use public store settings. No enquiry form is
 * submitted; the device's phone or email application handles each action.
 * Uses .lp-reveal for scroll-driven animations.
 */

const EMAIL_SUBJECT = encodeURIComponent("Inquiry — Abbey's Kitchenette");

export default function Contact({ settings = {} }) {
    const phone = settings.storePhone || "0929 781 1212";
    const email = settings.storeEmail || "maryrosemendoza78@yahoo.com";
    // Strip display punctuation and convert a Philippine local prefix for dialing.
    const digits = phone.replace(/\D/g, "");
    const dial = digits.startsWith("0") ? `+63${digits.slice(1)}` : phone.startsWith("+") ? `+${digits}` : digits;
    const actions = [
        {
            icon: "phone",
            label: "Call Us",
            value: phone,
            href: `tel:${dial}`,
        },
        {
            icon: "mail",
            label: "Email Us",
            value: email,
            href: `mailto:${encodeURIComponent(email)}?subject=${EMAIL_SUBJECT}`,
        },
    ];

    return (
        // Preserve #contact navigation while avoiding a second full-height section.
        <div id="contact" className="visit-contact-actions" aria-label="Contact Abbey's Kitchenette">
                {actions.map((action) => (
                    <a
                        key={action.label}
                        href={action.href}
                        className="contact-detail-item visit-contact-action"
                        aria-label={`${action.label}: ${action.value}`}
                    >
                        <div className="contact-detail-icon">
                            <Icon name={action.icon} size={18} />
                        </div>
                        <div className="contact-action-body">
                            <div className="contact-detail-label">{action.label}</div>
                            <div className="contact-detail-value">{action.value}</div>
                        </div>
                    </a>
                ))}
        </div>
    );
}
