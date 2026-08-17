import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordRequest } from "../api";
import { forgotPasswordSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

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
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />

                <div className="mt-8">
                    {submitted ? (
                        <div className="text-center space-y-4 animate-in fade-in-0 duration-300">
                            <Icon name="mail" size={40} className="mx-auto text-primary" />
                            <h2 className="text-lg font-semibold">Check your email</h2>
                            <p className="text-sm text-muted-foreground">
                                If an account exists with that email, we've sent a password reset link.
                            </p>
                            <Button variant="ghost" asChild>
                                <Link to="/login">← Back to login</Link>
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-in fade-in-0 slide-in-from-right-3 duration-300">
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
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    error={errors.email?.message}
                                    {...register("email")}
                                />
                            </div>

                            <Button type="submit" fullWidth disabled={isSubmitting}>
                                {isSubmitting ? "Sending..." : "Send reset link"}
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
