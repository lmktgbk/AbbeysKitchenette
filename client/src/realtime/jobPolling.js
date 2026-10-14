/** WebSockets prompt immediate refreshes, but a live connection does not prove
 * every completion event arrived. Keep a slower safety check while work runs,
 * and recover initial/transient fetch failures even before a status is cached.
 */
export function jobPollingInterval(query, connectionStatus) {
  const status = query?.state?.data?.data?.status;
  const failureStatus = query?.state?.error?.response?.status;
  if (["completed", "failed", "cancelled"].includes(status) || [401, 403, 404].includes(failureStatus)) return false;
  return status === "running" && connectionStatus === "live" ? 15000 : 5000;
}
