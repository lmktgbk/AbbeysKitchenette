export default function PrimarySpinner({ className = "", size = "default" }) {
    const sizeClasses = {
        default: "h-screen",
        sm: "h-12",
    };
    return (
        <div className={`flex items-center justify-center ${sizeClasses[size]} ${className}`}>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}