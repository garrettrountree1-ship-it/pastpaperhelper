/**
 * Public site origin used for links that are opened from an email inbox
 * (verification, password reset).
 *
 * Preview/editor hosts are gated behind Lovable project access, so a student
 * clicking a link that points there sees an "Access denied" page. Email links
 * must always point at the published site.
 */
export const PUBLIC_SITE_ORIGIN = "https://stemhomeworkai.lovable.app";

const GATED_HOST_PATTERNS = [
  "id-preview--",
  "lovableproject.com",
  "-dev.lovable.app",
  "localhost",
  "127.0.0.1",
];

export function emailLinkOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_SITE_ORIGIN;
  const { origin, hostname } = window.location;
  const gated = GATED_HOST_PATTERNS.some((pattern) => hostname.includes(pattern));
  return gated ? PUBLIC_SITE_ORIGIN : origin;
}
