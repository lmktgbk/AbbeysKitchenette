/** PrimarySpinner — centered loading spinner. WHY it exists: single full-section fallback while queries load; consumed by tabs and pages. State: none (props: size, className). */
export function ButtonSpinner({ className = "" }) {
    return (
        <span className={`h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
    );
}

function PrimarySpinner({ className = "", size = "default" }) {
    const normalized = size === "default" ? "page" : size === "sm" ? "section" : size;
    const outerClasses = {
        page: "flex items-center justify-center h-screen",
        section: "flex items-center justify-center h-48",
        inline: "inline-flex items-center justify-center",
        xs: "inline-flex items-center justify-center",
    };
    const ringClasses = {
        page: "h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent",
        section: "h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent",
        inline: "h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent",
        xs: "h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent",
    };
    return (
        <div className={`${outerClasses[normalized]} ${className}`}>
            <div className={ringClasses[normalized]} />
        </div>
    );
}

export { PrimarySpinner };
export default PrimarySpinner;