/**
 * LoginPage — staff login card (branding + EmailForm in staff mode).
 * WHY it exists: dedicated staff entry point with no forgot-password link (admin-only
 * flow). Query keys consumed: none (auth uses direct API + EmailForm mutation).
 * Guards: public route with authenticated-redirect; mustChangePwd → /change-password.
 * State: Query [] | local [] | Zustand [user/token via useAuthStore inside EmailForm].
 */
import AuthBranding from "../components/AuthBranding";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
    return (
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>
            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />
                <div className="mt-2 mb-6 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Staff Login
                    </span>
                </div>
                <div className="mt-8">
                    {/* Staff portal: no forgot-password link (admin-only). */}
                    <EmailForm mode="staff" />
                </div>
            </div>
        </Card>
    );
}
