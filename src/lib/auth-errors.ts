/**
 * Auth requests can fail before they ever reach our servers — flaky school
 * Wi-Fi, mobile data drop-outs, VPNs, or a network that filters traffic to the
 * login service. Those surface in the browser as a bare "Failed to fetch",
 * which reads to a student like their account is broken.
 */
const NETWORK_MESSAGE_PATTERNS = [
  "failed to fetch",
  "network request failed",
  "networkerror",
  "load failed",
  "err_network",
  "err_connection",
  "err_name_not_resolved",
  "err_timed_out",
  "connection closed",
  "fetch failed",
  "timeout",
  "aborted",
];

export function isNetworkAuthError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  const text = raw.toLowerCase();
  return NETWORK_MESSAGE_PATTERNS.some((pattern) => text.includes(pattern));
}

export const NETWORK_AUTH_MESSAGE =
  "We couldn't reach the login service — this is a connection problem, not your account. Check your internet, turn any VPN or proxy off (or on, if your network filters traffic), then try again. Mobile data usually works.";

export function describeAuthError(error: unknown, fallback?: string): string {
  if (isNetworkAuthError(error)) return NETWORK_AUTH_MESSAGE;
  if (fallback) return fallback;
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** Runs an auth call, retrying once after a short pause on a network failure. */
export async function withAuthRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isNetworkAuthError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return run();
  }
}
