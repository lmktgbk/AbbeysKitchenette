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
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    Heart,
    Coffee,
    Users,
    MapPin,
    Clock,
    Phone,
    Send,
    LayoutDashboard,
    Package,
    Warehouse,
    ShoppingCart,
    TrendingUp,
    ShoppingBag,
    FileText,
    Settings,
    LogOut,
    Bell,
    Search,
    AlertTriangle,
    TrendingDown,
    Lightbulb,
    Minus,
    Edit,
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
    chevronLeft: ChevronLeft,
    chevronDown: ChevronDown,
    chevronRight: ChevronRight,
    heart: Heart,
    coffee: Coffee,
    users: Users,
    mapPin: MapPin,
    clock: Clock,
    phone: Phone,
    send: Send,
    dashboard: LayoutDashboard,
    package: Package,
    warehouse: Warehouse,
    cart: ShoppingCart,
    trendingUp: TrendingUp,
    shoppingBag: ShoppingBag,
    fileText: FileText,
    settings: Settings,
    logOut: LogOut,
    bell: Bell,
    search: Search,
    alertTriangle: AlertTriangle,
    trendingDown: TrendingDown,
    lightbulb: Lightbulb,
    minus: Minus,
    edit: Edit,
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