import Icon from "@/components/ui/icon";

function formatStoreHours(hours) {
  if (!hours) return "Hours not set";
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const enabled = days.filter((d) => hours[d]?.enabled);
  if (enabled.length === 0) return "Currently closed";
  const open = hours[enabled[0]]?.open || "08:00";
  const close = hours[enabled[0]]?.close || "20:00";
  const fmt = (t) => {
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    if (hr === 0) return `12:${m} AM`;
    if (hr === 12) return `12:${m} PM`;
    return hr > 12 ? `${hr - 12}:${m} PM` : `${hr}:${m} AM`;
  };
  return `Mon – Sun: ${fmt(open)} – ${fmt(close)}`;
}

export default function Location({ settings = {} }) {
    const details = [
        {
            icon: "mapPin",
            label: "Address",
            value: settings.storeAddress || "Robledo Compound, Bulacnin, Lipa City",
        },
        {
            icon: "clock",
            label: "Hours",
            value: formatStoreHours(settings.storeHours),
        },
        {
            icon: "phone",
            label: "Phone",
            value: settings.storePhone || "0929 781 1212",
        },
        {
            icon: "mail",
            label: "Email",
            value: settings.storeEmail || "maryrosemendoza78@yahoo.com",
        },
    ];

    return (
        <section id="location" className="landing-section">
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Visit Us</h2>
                <p className="landing-subtitle" style={{ marginTop: "0.75rem" }}>
                    We'd love to see you! Come dine in and experience the Abbey's
                    Kitchenette difference.
                </p>
                <span className="landing-title-line" />
            </div>

            <div className="location-grid" style={{ marginTop: "3.5rem" }}>
                {/* Info */}
                <div className="location-info lp-reveal lp-reveal-delay-1">
                    {details.map((item) => (
                        <div key={item.label} className="location-item">
                            <div className="location-icon">
                                <Icon name={item.icon} size={18} />
                            </div>
                            <div>
                                <div className="location-item-label">{item.label}</div>
                                <div className="location-item-value">{item.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Image */}
                <div className="lp-reveal lp-reveal-delay-2">
                    <img
                        src="/landing/outdoor_tent.jpg"
                        alt="Abbey's Kitchenette outdoor seating area"
                        className="location-image"
                        loading="lazy"
                    />
                </div>
            </div>
        </section>
    );
}
