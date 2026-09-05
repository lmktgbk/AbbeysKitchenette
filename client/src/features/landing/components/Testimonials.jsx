/**
 * Testimonials
 * Customer reviews section — glassmorphism cards on dark background.
 * Featured reviews from Facebook.
 * Uses .lp-reveal for scroll-driven animations.
 */

const reviews = [
    {
        name: "Jai Louise",
        text: "Our family loves this place and will be back. Drinks and food are delicious and affordable. We love the cozy, chill, and relaxing atmosphere and music.",
        source: "Facebook",
        rating: 5,
    },
    {
        name: "Dan AR Vee",
        text: "Superb ang pagkain, grabe! Super affordable for the serving na sobrang laki at dami. Highly recommended ko itong hidden gem for food lovers!",
        source: "Facebook",
        rating: 5,
    },
    {
        name: "John Philip Q. Escalora",
        text: "One of the best cafe and restaurant I've ever been. The staff are so welcoming. Quantity of the serving doesn't compromise its quality!",
        source: "Facebook",
        rating: 5,
    },
];

/** Get initials from a name (max 2 characters). */
function getInitials(name) {
    return name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

export default function Testimonials() {
    return (
        <section id="testimonials" className="landing-section">
            <div className="text-center lp-reveal">
                <h2 className="landing-title landing-title-light">What People Say</h2>
                <p className="landing-subtitle" style={{ color: "rgba(255,255,255,0.55)", marginTop: "0.75rem" }}>
                    Don't just take our word for it — hear from our happy customers.
                </p>
                <span className="landing-title-line" />
            </div>

            <div className="testimonials-grid" style={{ marginTop: "3rem" }}>
                {reviews.map((review, i) => (
                    <div
                        key={review.name}
                        className={`testimonial-card lp-reveal lp-reveal-delay-${i + 1}`}
                    >
                        {/* Star rating */}
                        <div className="testimonial-stars" aria-label={`${review.rating} stars`}>
                            {Array.from({ length: review.rating }).map((_, si) => (
                                <span key={si} style={{ fontSize: "0.9rem" }}>★</span>
                            ))}
                        </div>

                        <p className="testimonial-quote">"{review.text}"</p>

                        <div className="testimonial-author">
                            <div className="testimonial-avatar">
                                {getInitials(review.name)}
                            </div>
                            <div>
                                <div className="testimonial-name">{review.name}</div>
                                <div className="testimonial-source">via {review.source}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
