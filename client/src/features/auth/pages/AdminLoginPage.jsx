/**
 * AdminLoginPage — standalone admin login (email + password + OTP).
 * WHY it exists: separate from staff login; only entry with forgot-password link, reached
 * directly via /admin-login. Query keys consumed: none (direct auth API via EmailForm).
 * Guards: public admin-only route; no BR-02 shift gate.
 * State: Query [] | local [] | Zustand [user/token via useAuthStore inside EmailForm].
 */
import { Link } from "react-router-dom";
import AuthBranding from "../components/AuthBranding";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminLoginPage() {
    return (
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />

                <div className="mt-2 mb-6 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Admin Login
                    </span>
                </div>

                <EmailForm mode="admin" />

                <div className="mt-4 text-center">
                    <Button variant="ghost" size="sm" asChild>
                        <Link to="/forgot-password">Forgot password?</Link>
                    </Button>
                </div>
            </div>
        </Card>
    );
}
