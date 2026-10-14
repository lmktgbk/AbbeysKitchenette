import { useState } from "react";
import Icon from "@/components/ui/icon";
import { GALLERY_PHOTOS } from "./Gallery";

/**
 * About
 * About section telling the story of Abbey's Kitchenette.
 * Two-column layout: interactive image (left) + text (right) on desktop, stacked on mobile.
 * The image cycles through gallery photos when clicked.
 * Uses .lp-reveal + .lp-reveal-delay-* for scroll-driven fade-up animations
 * (triggered by IntersectionObserver in LandingPage.jsx).
 */
export default function About() {
    const defaultIndex = GALLERY_PHOTOS.findIndex((p) => p.src.includes("macrame"));
    const [currentIndex, setCurrentIndex] = useState(defaultIndex >= 0 ? defaultIndex : 0);

    const currentPhoto = GALLERY_PHOTOS[currentIndex] || GALLERY_PHOTOS[0];

    const handleNextImage = () => {
        setCurrentIndex((prev) => (prev + 1) % GALLERY_PHOTOS.length);
    };

    const handlePrevImage = (e) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length);
    };

    const values = [
        { icon: "heart",    label: "Built with Love" },
        { icon: "coffee",   label: "Cozy Atmosphere" },
        { icon: "utensils", label: "Quality Food" },
        { icon: "users",    label: "Friendly Service" },
    ];

    return (
        <section id="about" className="landing-section">
            {/* Section Header */}
            <div className="text-center lp-reveal">
                <h2 className="landing-title">Our Story</h2>
                <span className="landing-title-line" />
            </div>

            <div className="about-grid" style={{ marginTop: "3.5rem" }}>
                {/* Interactive Gallery Image */}
                <div className="lp-reveal lp-reveal-delay-1">
                    <div
                        className="about-image-wrapper"
                        onClick={handleNextImage}
                        title="Click to view next photo from gallery"
                        role="button"
                        tabIndex={0}
                        aria-label={`Photo: ${currentPhoto.title}. Click to view next gallery photo.`}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleNextImage();
                            }
                        }}
                    >
                        <img
                            key={currentPhoto.src}
                            src={currentPhoto.src}
                            alt={currentPhoto.title}
                            className="about-image about-image-animated"
                            loading="lazy"
                        />

                        {/* Navigation arrows (desktop hover / mobile visible) */}
                        <button
                            type="button"
                            className="about-image-nav-btn about-image-nav-prev"
                            onClick={handlePrevImage}
                            aria-label="Previous gallery photo"
                        >
                            <Icon name="chevronLeft" size={18} />
                        </button>
                        <button
                            type="button"
                            className="about-image-nav-btn about-image-nav-next"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNextImage();
                            }}
                            aria-label="Next gallery photo"
                        >
                            <Icon name="chevronRight" size={18} />
                        </button>

                        {/* Photo Title & Counter Badge */}
                        <div className="about-image-badge">
                            <Icon name="camera" size={12} />
                            <span>{currentPhoto.title}</span>
                            <span className="about-image-badge-counter">
                                {currentIndex + 1} / {GALLERY_PHOTOS.length}
                            </span>
                        </div>

                        {/* Click to change hint */}
                        <div className="about-image-hint">
                            <span>Click to change</span>
                            <Icon name="chevronRight" size={13} />
                        </div>
                    </div>
                </div>

                {/* Text */}
                <div className="about-text lp-reveal lp-reveal-delay-2">
                    <p className="about-eyebrow">About Us</p>
                    <h3>A Cafe Built in Love &amp; Perseverance</h3>
                    <p>
                        Abbey's Kitchenette is a restaurant cafe built in love and
                        perseverance. What started as a passion project has grown into a
                        beloved dining destination in Lipa City, serving the best tasting
                        drinks and mouth-watering dishes.
                    </p>
                    <p>
                        We believe every meal should be an experience — from our carefully
                        crafted menu to our cozy, chill, and relaxing atmosphere. Whether
                        you're here for a quick coffee, a family meal, or a hangout with
                        friends, we make sure every visit feels like home.
                    </p>

                    {/* Value Tags */}
                    <div className="about-values">
                        {values.map((v) => (
                            <span key={v.label} className="about-value-tag">
                                <Icon name={v.icon} size={14} />
                                {v.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
