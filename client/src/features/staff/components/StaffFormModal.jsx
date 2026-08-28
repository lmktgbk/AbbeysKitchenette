import { useEffect } from "react";
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
import { DropDown } from "@/components/filters/DropDown";
import { createStaffSchema, editStaffSchema, ROLE_OPTIONS } from "../staffValidation";

/**
 * StaffFormModal
 *
 * Create new staff or edit existing staff.
 * Create mode: name, email, role (cashier/kitchen). PIN auto-generated.
 * Edit mode: name, email, role.
 */
export default function StaffFormModal({
  open,
  onOpenChange,
  staff,
  isEditMode = false,
  onSubmit,
  isLoading,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEditMode ? editStaffSchema : createStaffSchema),
    defaultValues: getDefaultValues(staff, isEditMode),
  });

  useEffect(() => {
    if (open) {
      reset(getDefaultValues(staff, isEditMode));
    }
  }, [open, isEditMode, staff, reset]);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleFormSubmit(data) {
    onSubmit(data);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Staff" : "Add New Staff"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update staff member details."
              : "Create a new staff account. PIN is auto-generated."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Name
            </label>
            <Input
              placeholder="e.g. Juan Dela Cruz"
              error={errors.name?.message}
              {...register("name")}
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Email
            </label>
            <Input
              type="email"
              placeholder="e.g. juan@example.com"
              error={errors.email?.message}
              {...register("email")}
            />
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Role
            </label>
            <DropDown
              value={staff?.role || ""}
              options={isEditMode ? ROLE_OPTIONS : ROLE_OPTIONS.filter(o => o.value !== "admin")}
              placeholder="Select role..."
              onChange={(val) => setValue("role", val, { shouldValidate: true })}
            />
            {errors.role && (
              <p className="mt-1.5 text-xs text-destructive">{errors.role.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isEditMode
                  ? "Saving..."
                  : "Creating..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultValues(staff, isEditMode) {
  if (isEditMode && staff) {
    return {
      name: staff.name || "",
      email: staff.email || "",
      role: staff.role || "cashier",
    };
  }
  return {
    name: "",
    email: "",
    role: "cashier",
  };
}
