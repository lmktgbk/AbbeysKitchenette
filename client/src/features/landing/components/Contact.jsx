import Icon from "@/components/ui/icon";

/**
 * Contact
 * Contact section with form and contact details.
 * Form is frontend-only for now.
 */
export default function Contact() {
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

    const handleSubmit = (e) => {
        e.preventDefault();
        // Frontend-only for now
        alert("Thank you for your message! We'll get back to you soon.");
    };

    return (
        <section id="contact" className="landing-section bg-background">
            <div className="text-center">
                <h2 className="landing-title">Get in Touch</h2>
                <p className="landing-subtitle">
                    Have a question, suggestion, or want to place a reservation?
                    We'd love to hear from you.
                </p>
            </div>

            <div className="contact-grid mt-10">
                {/* Contact Form */}
                <form className="contact-form" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Your Name"
                        className="contact-input"
                        required
                    />
                    <input
                        type="email"
                        placeholder="Your Email"
                        className="contact-input"
                        required
                    />
                    <textarea
                        placeholder="Your Message"
                        className="contact-input contact-textarea"
                        required
                    />
                    <button type="submit" className="contact-submit">
                        <Icon name="send" size={16} />
                        Send Message
                    </button>
                </form>

                {/* Contact Details */}
                <div className="contact-details">
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
