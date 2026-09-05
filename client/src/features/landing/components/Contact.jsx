import { useState } from "react";
import Icon from "@/components/ui/icon";

/**
 * Contact
 * Contact section with enquiry form and contact details.
 * Form is frontend-only — shows success state on submit.
 * Uses .lp-reveal for scroll-driven animations.
 */
export default function Contact() {
    const [sent, setSent] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", message: "" });

    const details = [
        {
            icon: "mapPin",
            label: "Address",
            value: "Robledo Compound, Bulacnin, Lipa City",
        },
        {
            icon: "phone",
            label: "Phone",
            value: "0929 781 1212",
        },
        {
            icon: "mail",
            label: "Email",
            value: "maryrosemendoza78@yahoo.com",
        },
    ];

    const handleChange = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setSent(true);
        setForm({ name: "", email: "", message: "" });
    };

    return (
        <section id="contact" className="landing-section">
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Get in Touch</h2>
                <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                    Have a question, suggestion, or want to place a reservation?
                    We'd love to hear from you.
                </p>
                <span className="landing-title-line" />
            </div>

            <div className="contact-grid" style={{ marginTop: "3.5rem" }}>
                {/* Contact Form */}
                <div className="lp-reveal lp-reveal-delay-1">
                    {sent ? (
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "3rem 2rem",
                                textAlign: "center",
                                gap: "1rem",
                                background: "#fffbf5",
                                borderRadius: "1rem",
                                border: "1.5px solid rgba(245,158,11,0.2)",
                            }}
                        >
                            <div
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: "999px",
                                    background: "linear-gradient(135deg, #f59e0b, #c2410c)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#fff",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                <Icon name="checkCircle" size={28} />
                            </div>
                            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.25rem", fontWeight: 700, color: "#1c1008", margin: 0 }}>
                                Message Sent!
                            </h3>
                            <p style={{ color: "#7c5c3e", fontSize: "0.9375rem", margin: 0 }}>
                                Thank you! We'll get back to you soon.
                            </p>
                            <button
                                onClick={() => setSent(false)}
                                style={{
                                    marginTop: "0.5rem",
                                    padding: "0.6rem 1.5rem",
                                    borderRadius: "999px",
                                    border: "1.5px solid rgba(245,158,11,0.3)",
                                    background: "transparent",
                                    color: "#d97706",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontSize: "0.875rem",
                                    fontFamily: "Inter, sans-serif",
                                }}
                            >
                                Send Another
                            </button>
                        </div>
                    ) : (
                        <form className="contact-form" onSubmit={handleSubmit}>
                            <input
                                type="text"
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder="Your Name"
                                className="contact-input"
                                required
                            />
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                placeholder="Your Email"
                                className="contact-input"
                                required
                            />
                            <textarea
                                name="message"
                                value={form.message}
                                onChange={handleChange}
                                placeholder="Your Message"
                                className="contact-input contact-textarea"
                                required
                            />
                            <button type="submit" className="contact-submit">
                                <Icon name="send" size={16} />
                                Send Message
                            </button>
                        </form>
                    )}
                </div>

                {/* Contact Details */}
                <div className="contact-details lp-reveal lp-reveal-delay-2">
                    {details.map((item) => (
                        <div key={item.label} className="contact-detail-item">
                            <div className="contact-detail-icon">
                                <Icon name={item.icon} size={18} />
                            </div>
                            <div>
                                <div className="contact-detail-label">{item.label}</div>
                                <div className="contact-detail-value">{item.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
