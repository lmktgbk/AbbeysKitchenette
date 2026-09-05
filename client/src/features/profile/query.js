import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useAuthStore from "@/features/auth/authStore";
import {
  updateProfileRequest,
  changePasswordRequest,
  uploadImageRequest,
} from "./api";

/**
 * Profile mutations hook.
 * Returns mutations for updating profile, changing password, and uploading image.
 * All mutations invalidate auth queries and update the Zustand store on success.
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
      toast.success("Profile updated");
    },
    onError: (err) => {
      const msg = err.response?.data?.message || "Failed to update profile";
      toast.error(msg);
    },
  });

  const changePassword = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
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

  return { updateProfile, changePassword, uploadImage };
}
