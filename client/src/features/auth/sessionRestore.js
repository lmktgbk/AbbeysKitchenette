import { getMeRequest } from "./api";

/** One cached cookie-session check serves the provider and its retry screen. */
export const sessionQueryOptions = {
  queryKey: ["auth", "me"], queryFn: getMeRequest,
  retry: false, retryOnMount: false, staleTime: Infinity,
};

/** Undefined preserves identity while the server is unavailable. A confirmed
 * session rejection clears only the generation that issued the failed request.
 */
export function sessionRestoreUser(result, currentEpoch) {
  if (result.isSuccess) return result.data?.data?.user;
  const error = result.error;
  if (result.isError && error?.response?.status === 401 &&
      ["UNAUTHORIZED", "TOKEN_EXPIRED"].includes(error.response.data?.error) &&
      error.config?.sessionEpoch === currentEpoch) return null;
  return undefined;
}
