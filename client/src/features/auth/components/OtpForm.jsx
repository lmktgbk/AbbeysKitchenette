import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { verifyOtpRequest, resendOtpRequest } from "../api";
import useAuthStore from "@/features/auth/authStore";
import { otpSchema } from "../authValidation";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * OtpForm — Reusable OTP verification form.
 * Used by EmailForm (admin 2FA) and can be used anywhere OTP is needed.
 */
export default function OtpForm({ userId }) {
    const [serverError, setServerError] = useState("");
    const [resending, setResending] = useState(false);
    const setUser = useAuthStore((s) => s.setUser);
    const navigate = useNavigate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(otpSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");

        try {
            const result = await verifyOtpRequest(userId, data.code);
            const { user } = result.data;
            setUser(user);
            toast.success("Login Successful", {
                description: `Welcome, ${user.name}!`,
            });
            navigate("/dashboard");
        } catch (err) {
            setServerError(
                err.response?.data?.message || "Invalid or expired OTP code."
            );
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            await resendOtpRequest(userId);
            toast.success("OTP Sent", { description: "Check your email for a new code." });
        } catch {
            toast.error("Failed to resend OTP");
        } finally {
            setResending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 text-center animate-in fade-in-0 slide-in-from-right-3 duration-300">
            <Icon name="mail" size={32} className="mx-auto text-primary" />
            <p className="text-sm font-medium">Enter the 6-digit code sent to your email</p>

            {serverError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {serverError}
                </div>
            )}

            <Input
                type="text"
                placeholder="000000"
                maxLength={6}
                className="mx-auto max-w-[200px] text-center text-lg tracking-[0.5em]"
                autoFocus
                error={errors.code?.message}
                {...register("code")}
            />

            <div className="flex flex-col gap-3">
                <Button type="submit" fullWidth disabled={isSubmitting}>
                    {isSubmitting ? "Verifying..." : "Verify"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleResend}
                    disabled={resending || isSubmitting}
                >
                    {resending ? "Sending..." : "Resend OTP"}
                </Button>
            </div>
        </form>
    );
}
