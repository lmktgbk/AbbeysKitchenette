/**
 * AuthBranding
 * Logo + app name + subtitle.
 * Reused across all auth pages (login, forgot password, etc.).
 */
export default function AuthBranding() {
    return (
        <div className="flex flex-col items-center gap-4">
            <img
                src="/favicon.png"
                alt="Abbey's Kitchenette"
                className="auth-logo"
            />
            <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">
                    Abbey's Kitchenette
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Intelligent POS & Inventory Management System
                </p>
            </div>
        </div>
    );
}
