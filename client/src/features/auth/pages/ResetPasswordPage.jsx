import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordRequest } from "../api";
import { resetPasswordSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import Icon from "@/components/ui/icon";
import ModeToggle from "@/components/ModeToggle";

/**
 * ResetPasswordPage
 * Reached via email link with token in URL.
 * Admin enters new password + confirm.
 */
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
        <div className="glass-card relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="animate-fade-in">
                <AuthBranding />

                <div className="mt-8">
                    {!token ? (
                        /* Invalid token */
                        <div className="text-center space-y-4 animate-fade-in">
                            <Icon name="lock" size={40} className="mx-auto text-destructive" />
                            <h2 className="text-lg font-semibold">Invalid Reset Link</h2>
                            <p className="text-sm text-muted-foreground">
                                This password reset link is invalid or has expired.
                            </p>
                            <Link to="/forgot-password" className="link-auth inline-block mt-4">
                                Request a new link
                            </Link>
                        </div>
                    ) : submitted ? (
                        /* Success */
                        <div className="text-center space-y-4 animate-fade-in">
                            <Icon name="lock" size={40} className="mx-auto text-primary" />
                            <h2 className="text-lg font-semibold">Password Reset Successful</h2>
                            <p className="text-sm text-muted-foreground">
                                Your password has been updated. You can now login with your new password.
                            </p>
                            <button
                                onClick={() => navigate("/login")}
                                className="btn-auth mt-4"
                            >
                                Go to Login
                            </button>
                        </div>
                    ) : (
                        /* Reset form */
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-slide-in">
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
                                <input
                                    id="password"
                                    type="password"
                                    placeholder="Min 8 characters"
                                    className="input-auth"
                                    {...register("password")}
                                />
                                {errors.password && (
                                    <p className="text-sm text-destructive">{errors.password.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="confirmPassword" className="text-sm font-medium">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="Re-enter password"
                                    className="input-auth"
                                    {...register("confirmPassword")}
                                />
                                {errors.confirmPassword && (
                                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                                )}
                            </div>

                            <button type="submit" className="btn-auth" disabled={isSubmitting}>
                                {isSubmitting ? "Resetting..." : "Reset Password"}
                            </button>

                            <div className="text-center">
                                <Link to="/login" className="link-auth">
                                    ← Back to login
                                </Link>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
