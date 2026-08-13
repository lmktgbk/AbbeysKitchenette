import {
    Sun,
    Moon,
    User,
    ArrowLeft,
    ArrowDown,
    Mail,
    Lock,
    ChefHat,
    UtensilsCrossed,
    Menu,
    X,
    ChevronDown,
    Heart,
    Coffee,
    Users,
    MapPin,
    Clock,
    Phone,
    Send,
} from "lucide-react";

const iconMap = {
    sun: Sun,
    moon: Moon,
    user: User,
    arrowLeft: ArrowLeft,
    arrowDown: ArrowDown,
    mail: Mail,
    lock: Lock,
    chefHat: ChefHat,
    utensils: UtensilsCrossed,
    menu: Menu,
    x: X,
    chevronDown: ChevronDown,
    heart: Heart,
    coffee: Coffee,
    users: Users,
    mapPin: MapPin,
    clock: Clock,
    phone: Phone,
    send: Send,
};

/**
 * Icon component
 * Wraps lucide-react icons for consistent usage across the app.
 * @param {string} name - icon name from iconMap
 * @param {number} size - icon size in px (default 20)
 * @param {string} className - tailwind classes
 */
export default function Icon({ name, size = 20, className = "" }) {
    const LucideIcon = iconMap[name];
    if (!LucideIcon) return null;

    return <LucideIcon size={size} className={className} />;
}