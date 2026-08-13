import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordRequest } from "../api";
import { forgotPasswordSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import Icon from "@/components/ui/icon";
import ModeToggle from "@/components/ModeToggle";

/**
 * ForgotPasswordPage
 * Admin enters email to receive a password reset link.
 * Always shows success message (don't reveal if email exists).
 */
export default function ForgotPasswordPage() {
    const [submitted, setSubmitted] = useState(false);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(forgotPasswordSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");
        try {
            await forgotPasswordRequest(data.email);
            setSubmitted(true);
        } catch {
            setServerError("Something went wrong. Please try again.");
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
                    {submitted ? (
                        <div className="text-center space-y-4 animate-fade-in">
                            <Icon name="mail" size={40} className="mx-auto text-primary" />
                            <h2 className="text-lg font-semibold">Check your email</h2>
                            <p className="text-sm text-muted-foreground">
                                If an account exists with that email, we've sent a password reset link.
                            </p>
                            <Link to="/login" className="link-auth inline-block mt-4">
                                ← Back to login
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-slide-in">
                            <div className="text-center">
                                <h2 className="text-lg font-semibold">Forgot Password</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Enter your email and we'll send you a reset link.
                                </p>
                            </div>

                            {serverError && (
                                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                    {serverError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    className="input-auth"
                                    {...register("email")}
                                />
                                {errors.email && (
                                    <p className="text-sm text-destructive">{errors.email.message}</p>
                                )}
                            </div>

                            <button type="submit" className="btn-auth" disabled={isSubmitting}>
                                {isSubmitting ? "Sending..." : "Send reset link"}
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
