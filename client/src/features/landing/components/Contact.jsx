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
        <section id="contact" className="landing-section">
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Get in Touch</h2>
                <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                    Have a question, suggestion, or want to place a reservation?
                    Call or email us directly.
                </p>
                <span className="landing-title-line" />
            </div>

            <div className="contact-actions lp-reveal lp-reveal-delay-1" style={{ marginTop: "3.5rem" }}>
                {actions.map((action) => (
                    <a
                        key={action.label}
                        href={action.href}
                        className="contact-detail-item contact-action"
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
        </section>
    );
}
