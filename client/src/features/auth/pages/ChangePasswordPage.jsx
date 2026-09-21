import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordRequest } from "../api";
import { changePasswordSchema } from "../authValidation";
import useAuthStore from "@/features/auth/authStore";
import AuthBranding from "../components/AuthBranding";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * ChangePasswordPage — forced first-login change (authenticated).
 * Rendered at /change-password when user.mustChangePwd is true.
 * Uses POST /auth/change-password which clears mustChangePwd.
 */
export default function ChangePasswordPage() {
    const navigate = useNavigate();
    const [serverError, setServerError] = useState("");
    const user = useAuthStore((s) => s.user);
    const setUser = useAuthStore((s) => s.setUser);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(changePasswordSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");
        try {
            await changePasswordRequest(data.currentPassword, data.password);
            // mustChangePwd cleared server-side; reflect locally to pass the guard.
            setUser({ ...user, mustChangePwd: false });
            toast.success("Password updated", { description: "Use your new password next time." });
            switch (user?.role) {
                case "admin": navigate("/dashboard"); break;
                case "kitchen": navigate("/kitchen"); break;
                default: navigate("/pos");
            }
        } catch (err) {
            const msg = err.response?.data?.message;
            if (msg) {
                setServerError(msg);
            } else {
                toast.error("Failed to change password. Please try again.");
            }
        }
    };

    return (
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>
            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />

                <div className="mt-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div className="text-center">
                            <h2 className="text-lg font-semibold">Set New Password</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Your admin reset your password. Set a new one to continue.
                            </p>
                        </div>

                        {serverError && (
                            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                {serverError}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="currentPassword" className="text-sm font-medium">
                                Temporary Password
                            </label>
                            <Input
                                id="currentPassword"
                                type="password"
                                placeholder="Enter the password from your email"
                                error={errors.currentPassword?.message}
                                {...register("currentPassword")}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                New Password
                            </label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Min 8 characters"
                                error={errors.password?.message}
                                {...register("password")}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-sm font-medium">
                                Confirm Password
                            </label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Re-enter new password"
                                error={errors.confirmPassword?.message}
                                {...register("confirmPassword")}
                            />
                        </div>

                        <Button type="submit" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Set New Password"}
                        </Button>
                    </form>
                </div>
            </div>
        </Card>
    );
}
