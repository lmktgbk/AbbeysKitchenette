import { useState } from "react";
import Icon from "@/components/ui/icon";

// Ambiance, decor, gazebos, neon wall, and events (no food/drinks)
export const GALLERY_PHOTOS = [
    {
        id: 1,
        title: "Neon Leaf Wall",
        category: "neon",
        aspect: "portrait",
        src: "/landing/leaf_wall_living.jpg",
    },
    {
        id: 2,
        title: "Outdoor Night Gazebo",
        category: "night",
        aspect: "landscape",
        src: "/landing/outdoor_gazebo.jpg",
    },
    {
        id: 3,
        title: "Macrame & Boho Nook",
        category: "indoor",
        aspect: "portrait",
        src: "/landing/macrame_corner.png",
    },
    {
        id: 4,
        title: "Anniversary Party Setup",
        category: "indoor",
        aspect: "landscape",
        src: "/landing/anniversary_setup.jpg",
    },
    {
        id: 5,
        title: "Daytime Garden Courtyard",
        category: "garden",
        aspect: "landscape",
        src: "/landing/daytime_courtyard.jpg",
    },
    {
        id: 6,
        title: "Group Gathering at Neon Wall",
        category: "neon",
        aspect: "landscape",
        src: "/landing/group_neon_wall.jpg",
    },
    {
        id: 7,
        title: "Gazebo Ambiance",
        category: "night",
        aspect: "portrait",
        src: "/landing/gazebo_interior.jpg",
    },
    {
        id: 8,
        title: "Rose Gold Balloon Ceiling",
        category: "indoor",
        aspect: "landscape",
        src: "/landing/rose_gold_balloons.jpg",
    },
    {
        id: 9,
        title: "Daytime Patio Gathering",
        category: "garden",
        aspect: "landscape",
        src: "/landing/daytime_patio_crowd.jpg",
    },
    {
        id: 10,
        title: "Outdoor Courtyard Lawn",
        category: "garden",
        aspect: "landscape",
        src: "/landing/outdoor_courtyard.jpg",
    },
];

/**
 * Gallery — Instagram Grid Style
 * Ambiance & Event photography only (food items removed).
 * Pure full-screen aesthetic lightbox view for every image.
 */
export default function Gallery() {
    const [activeFilter, setActiveFilter] = useState("all");
    const [selectedImg, setSelectedImg] = useState(null);

    const photos = GALLERY_PHOTOS;

    const filters = [
        { id: "all",    label: "All" },
        { id: "indoor", label: "Indoor" },
        { id: "neon",   label: "Neon Wall" },
        { id: "garden", label: "Garden" },
        { id: "night",  label: "Night" },
    ];

    const filteredPhotos = activeFilter === "all" 
        ? photos 
        : photos.filter((p) => p.category === activeFilter);

    return (
        <section id="gallery" className="landing-section gallery-insta-section">
            {/* Minimal Header */}
            <div className="text-center lp-reveal">
                <p className="gallery-insta-eyebrow">Visual Experience</p>
                <h2 className="gallery-insta-title">Abbey's Gallery</h2>
            </div>

            {/* Instagram-style Minimal Filters */}
            <div className="gallery-insta-filters lp-reveal lp-reveal-delay-1">
                {filters.map((f, idx) => (
                    <span key={f.id} className="gallery-filter-item">
                        <button
                            className={`gallery-filter-link ${activeFilter === f.id ? "active" : ""}`}
                            onClick={() => setActiveFilter(f.id)}
                        >
                            {f.label}
                        </button>
                        {idx < filters.length - 1 && <span className="gallery-filter-dot">·</span>}
                    </span>
                ))}
            </div>

            {/* Masonry / Instagram Photo Feed */}
            <div className="gallery-insta-grid lp-reveal lp-reveal-delay-2">
                {filteredPhotos.map((photo) => (
                    <div
                        key={photo.id}
                        className={`gallery-insta-card aspect-${photo.aspect}`}
                        onClick={() => setSelectedImg(photo)}
                    >
                        <img
                            src={photo.src}
                            alt={photo.title}
                            className="gallery-insta-img"
                            loading="lazy"
                        />
                        <div className="gallery-insta-overlay">
                            <div className="gallery-insta-overlay-inner">
                                <h3 className="gallery-insta-card-title">{photo.title}</h3>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Aesthetic Instagram Lightbox Modal */}
            {selectedImg && (
                <div className="gallery-lightbox" onClick={() => setSelectedImg(null)}>
                    <div className="gallery-lightbox-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="gallery-lightbox-close"
                            onClick={() => setSelectedImg(null)}
                            aria-label="Close image view"
                        >
                            <Icon name="x" size={22} />
                        </button>
                        <img src={selectedImg.src} alt={selectedImg.title} className="gallery-lightbox-img" />
                        <div className="gallery-lightbox-info">
                            <h3>{selectedImg.title}</h3>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
