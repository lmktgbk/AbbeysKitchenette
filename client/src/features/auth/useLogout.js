import { toast } from "sonner";
import { logoutRequest } from "./api";
import { clearSession } from "./session";

/** Clear local identity after successful logout or an already-unauthorized response; return false on other failures. */
export async function logoutSession() {
  try {
    await logoutRequest();
  } catch (error) {
    if (error.response?.status !== 401) {
      // A failed revocation must not be presented as a successful sign-out.
      toast.error("Sign-out failed. Check your connection and try again.");
      return false;
    }
  }
  await clearSession();
  return true;
}

/** Expose the shared logout operation to navigation components without duplicating its failure policy. */
export default function useLogout() {
  return logoutSession;
}
