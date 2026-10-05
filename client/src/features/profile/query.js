/**
 * Profile Queries — owns self-profile / password / avatar mutations.
 * WHY: couples auth-cache invalidation and Zustand user sync with toasts in one place. Keys invalidated: ["auth", "me"] on profile/image success; no queries here (reads come from auth store); mutations only.
 * State: TanStack Query mutations + Zustand auth store sync (setUser); no query keys owned.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useAuthStore from "@/features/auth/authStore";
import { restoreSession } from "@/features/auth/session";
import {
  updateProfileRequest,
  confirmEmailChangeRequest,
  changePasswordRequest,
  uploadImageRequest,
} from "./api";

/**
 * Profile mutations hook.
 * Returns mutations for updating profile, changing password, and uploading image.
 * Profile/image saves refresh the auth query; password/email confirmation
 * restores the returned session profile and reconnects with the rotated cookie.
 */
export function useProfileMutations() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  const updateProfile = useMutation({
    mutationFn: updateProfileRequest,
    onSuccess: (res) => {
      setUser({ ...user, ...res.data.user });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success(res.data.emailChange ? "Verification code sent to your new email" : "Profile updated");
    },
    onError: (err) => {
      const msg = err.response?.data?.message || "Failed to update profile";
      toast.error(msg);
    },
  });

  const confirmEmailChange = useMutation({
    mutationFn: confirmEmailChangeRequest,
    onSuccess: (res) => {
      restoreSession(res.data.user);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Email verified; other sessions revoked");
    },
    onError: (err) => toast.error(err.response?.data?.message || "Email verification failed"),
  });

  const changePassword = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: (res) => {
      // The same operator receives renewed credentials. Keep feature data,
      // but replace the auth cache and the socket's server-side identity.
      restoreSession(res.data.user);
      toast.success("Password changed");
    },
    onError: (err) => {
      const msg = err.response?.data?.message || "Failed to change password";
      toast.error(msg);
    },
  });

  const uploadImage = useMutation({
    mutationFn: uploadImageRequest,
    onSuccess: (res) => {
      setUser({ ...user, ...res.data.user });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Profile image updated");
    },
    onError: (err) => {
      const msg =
        err.response?.data?.message || "Failed to upload image";
      toast.error(msg);
    },
  });

  return { updateProfile, confirmEmailChange, changePassword, uploadImage };
}
