import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePinRequest } from "../api";
import { changePinSchema } from "../authValidation";
import AuthBranding from "../components/AuthBranding";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ChangePinPage() {
    const navigate = useNavigate();
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(changePinSchema),
    });

    const onSubmit = async (data) => {
        setServerError("");
        try {
            await changePinRequest(data.newPin);
            toast.success("PIN Changed", { description: "Your new PIN is now active." });
            navigate("/pos");
        } catch (err) {
            setServerError(
                err.response?.data?.message || "Failed to change PIN. Please try again."
            );
        }
    };

    return (
        <Card className="p-8">
            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />

                <div className="mt-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-in fade-in-0 slide-in-from-right-3 duration-300">
                        <div className="text-center">
                            <h2 className="text-lg font-semibold">Set New PIN</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                You must set a new PIN before continuing.
                            </p>
                        </div>

                        {serverError && (
                            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                {serverError}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="newPin" className="text-sm font-medium">
                                New PIN
                            </label>
                            <Input
                                id="newPin"
                                type="password"
                                placeholder="4-6 digits"
                                maxLength={6}
                                error={errors.newPin?.message}
                                {...register("newPin")}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPin" className="text-sm font-medium">
                                Confirm PIN
                            </label>
                            <Input
                                id="confirmPin"
                                type="password"
                                placeholder="Re-enter PIN"
                                maxLength={6}
                                error={errors.confirmPin?.message}
                                {...register("confirmPin")}
                            />
                        </div>

                        <Button type="submit" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? "Setting..." : "Set New PIN"}
                        </Button>
                    </form>
                </div>
            </div>
        </Card>
    );
}
