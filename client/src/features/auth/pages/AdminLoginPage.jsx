import { Link } from "react-router-dom";
import AuthBranding from "../components/AuthBranding";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * AdminLoginPage — standalone admin login.
 * Separate from staff login. Email + password + OTP.
 * No link from staff login — must be accessed directly via /admin-login.
 */
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

                <EmailForm />

                <div className="mt-4 text-center">
                    <Button variant="ghost" size="sm" asChild>
                        <Link to="/forgot-password">Forgot password?</Link>
                    </Button>
                </div>
            </div>
        </Card>
    );
}
