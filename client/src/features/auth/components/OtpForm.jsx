import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { verifyOtpRequest, resendOtpRequest, otpFailure, otpSecondsRemaining } from "../api";
import { establishSession } from "../session";
import { otpSchema } from "../authValidation";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * Complete the password-bound email challenge for either login portal.
 * Retry deadlines are presentation state; the backend still enforces issuance,
 * expiry and attempt limits. onRestart returns an expired challenge to password
 * entry without navigating staff users into the admin portal or vice versa.
 */
export default function OtpForm({ userId, onRestart }) {
    const [serverError, setServerError] = useState("");
    const [resending, setResending] = useState(false);
    // Initial/successful delivery uses a conservative one-minute wait. A server
    // rejection replaces it with the remaining persisted cooldown or IP limit.
    const [retryAt, setRetryAt] = useState(() => Date.now() + 60_000);
    const [verifyBlockedUntil, setVerifyBlockedUntil] = useState(0);
    const [expired, setExpired] = useState(false);
    const [now, setNow] = useState(Date.now);
    const secondsLeft = otpSecondsRemaining(retryAt, now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    /** Apply timing to resend only, unless the shared auth budget blocks verification too. */
    const showFailure = useCallback((err) => {
        const failure = otpFailure(err);
        setServerError(failure.message);
        if (failure.retryAfterSeconds) {
            const deadline = Date.now() + failure.retryAfterSeconds * 1000;
            setRetryAt(deadline);
            setNow(Date.now());
            if (failure.rateLimited) setVerifyBlockedUntil(deadline);
        }
        if (failure.expired) setExpired(true);
        return failure.message;
    }, []);
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
            await establishSession(user);
            toast.success("Login Successful", {
                description: `Welcome, ${user.name}!`,
            });
            switch (user.role) {
                case "admin": navigate("/dashboard"); break;
                case "cashier": navigate("/pos"); break;
                case "kitchen": navigate("/kitchen"); break;
                default: navigate("/dashboard");
            }
        } catch (err) {
            showFailure(err);
        }
    };

    const handleResend = async () => {
        if (resending || expired || otpSecondsRemaining(retryAt) > 0) return;
        setResending(true);
        setServerError("");
        try {
            await resendOtpRequest(userId);
            setRetryAt(Date.now() + 60_000);
            setNow(Date.now());
            toast.success("OTP Sent", { description: "Check your email for a new code." });
        } catch (err) {
            toast.error(showFailure(err));
        } finally {
            setResending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 text-center animate-in fade-in-0 slide-in-from-right-3 duration-300">
            <Icon name="mail" size={32} className="mx-auto text-primary" />
            <p className="text-sm font-medium">Enter the 6-digit code sent to your email</p>

            {serverError && (
                <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
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
                <Button type="submit" fullWidth disabled={isSubmitting || resending || expired || verifyBlockedUntil > now}>
                    {isSubmitting ? "Verifying..." : "Verify"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleResend}
                    disabled={resending || isSubmitting || expired || secondsLeft > 0}
                >
                    {resending ? "Sending..." : secondsLeft > 0 ? `Resend OTP in ${secondsLeft}s` : "Resend OTP"}
                </Button>
                {expired && <Button type="button" variant="ghost" onClick={onRestart}>Sign in again</Button>}
            </div>
        </form>
    );
}
