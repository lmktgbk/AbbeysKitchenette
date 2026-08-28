import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { resetPinSchema } from "../staffValidation";

/**
 * ResetPinModal
 *
 * Reset a staff member's PIN.
 * Admin enters a new 4-6 digit PIN.
 */
export default function ResetPinModal({
  open,
  onOpenChange,
  staff,
  onSubmit,
  isLoading,
}) {
  const [showPin, setShowPin] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPinSchema),
    defaultValues: { new_pin: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ new_pin: "" });
      setShowPin(false);
    }
  }, [open, reset]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>Reset PIN</DialogTitle>
          <DialogDescription>
            Set a new PIN for <strong>{staff?.name}</strong>. They will be asked to
            change it on first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              New PIN
            </label>
            <div className="relative">
              <Input
                type={showPin ? "text" : "password"}
                placeholder="4-6 digits"
                error={errors.new_pin?.message}
                {...register("new_pin")}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name={showPin ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
