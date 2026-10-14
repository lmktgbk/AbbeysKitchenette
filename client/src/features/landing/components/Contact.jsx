import Icon from "@/components/ui/icon";

/**
 * Contact
 * Static direct-channel cards (call + email) styled like the Visit Us rows:
 * icon, label, value — no hints, no chevrons. Fully static values: nothing
 * reads from Settings, nothing is posted to the backend, so there is no
 * spam surface and no silent-failure mode.
 * Uses .lp-reveal for scroll-driven animations.
 */

const EMAIL_SUBJECT = encodeURIComponent("Inquiry — Abbey's Kitchenette");

const ACTIONS = [
    {
        icon: "phone",
        label: "Call Us",
        value: "0929 781 1212",
        href: "tel:+639297811212",
    },
    {
        icon: "mail",
        label: "Email Us",
        value: "maryrosemendoza78@yahoo.com",
        href: `mailto:maryrosemendoza78@yahoo.com?subject=${EMAIL_SUBJECT}`,
    },
];

export default function Contact() {
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
                {ACTIONS.map((action) => (
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
