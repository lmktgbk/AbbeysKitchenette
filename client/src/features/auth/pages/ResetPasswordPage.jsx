import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordRequest } from "../api";
import { resetPasswordSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token");
    const [submitted, setSubmitted] = useState(false);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(resetPasswordSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");
        try {
            await resetPasswordRequest(token, data.password);
            setSubmitted(true);
        } catch (err) {
            setServerError(
                err.response?.data?.message || "Reset link is invalid or has expired."
            );
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
                    {!token ? (
                        <div className="text-center space-y-4 animate-in fade-in-0 duration-300">
                            <Icon name="lock" size={40} className="mx-auto text-destructive" />
                            <h2 className="text-lg font-semibold">Invalid Reset Link</h2>
                            <p className="text-sm text-muted-foreground">
                                This password reset link is invalid or has expired.
                            </p>
                            <Button variant="ghost" asChild>
                                <Link to="/forgot-password">Request a new link</Link>
                            </Button>
                        </div>
                    ) : submitted ? (
                        <div className="text-center space-y-4 animate-in fade-in-0 duration-300">
                            <Icon name="lock" size={40} className="mx-auto text-primary" />
                            <h2 className="text-lg font-semibold">Password Reset Successful</h2>
                            <p className="text-sm text-muted-foreground">
                                Your password has been updated. You can now login with your new password.
                            </p>
                            <Button fullWidth onClick={() => navigate("/login")}>
                                Go to Login
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-in fade-in-0 slide-in-from-right-3 duration-300">
                            <div className="text-center">
                                <h2 className="text-lg font-semibold">Reset Password</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Enter your new password below.
                                </p>
                            </div>

                            {serverError && (
                                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                    {serverError}
                                </div>
                            )}

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
                                    placeholder="Re-enter password"
                                    error={errors.confirmPassword?.message}
                                    {...register("confirmPassword")}
                                />
                            </div>

                            <Button type="submit" fullWidth disabled={isSubmitting}>
                                {isSubmitting ? "Resetting..." : "Reset Password"}
                            </Button>

                            <div className="text-center">
                                <Button variant="ghost" size="sm" asChild>
                                    <Link to="/login">← Back to login</Link>
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </Card>
    );
}
