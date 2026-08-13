/**
 * Testimonials
 * Customer reviews section.
 * Featured reviews from Facebook.
 */

const reviews = [
    {
        name: "Jai Louise",
        text: "Our family loves this place and will be back. Drinks and food are delicious and affordable. We love the cozy, chill, and relaxing atmosphere and music.",
        source: "Facebook",
    },
    {
        name: "Dan AR Vee",
        text: "Superb ang pagkain, grabe! Super affordable for the serving na sobrang laki at dami. Highly recommended ko itong hidden gem for food lovers!",
        source: "Facebook",
    },
    {
        name: "John Philip Q. Escalora",
        text: "One of the best cafe and restaurant I've ever been. The staff are so welcoming. Quantity of the serving doesn't compromise its quality!",
        source: "Facebook",
    },
];

/**
 * Get initials from a name (max 2 characters).
 */
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
        <section id="testimonials" className="landing-section bg-muted/30">
            <div className="text-center">
                <h2 className="landing-title">What People Say</h2>
                <p className="landing-subtitle">
                    Don't just take our word for it — hear from our happy customers.
                </p>
            </div>

            <div className="testimonials-grid mt-10">
                {reviews.map((review) => (
                    <div key={review.name} className="testimonial-card">
                        <p className="testimonial-quote">{review.text}</p>
                        <div className="testimonial-author">
                            <div className="testimonial-avatar">
                                {getInitials(review.name)}
                            </div>
                            <div>
                                <div className="testimonial-name">{review.name}</div>
                                <div className="testimonial-source">
                                    via {review.source}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
