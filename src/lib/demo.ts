export const DEMO_EMAIL = "demo@stemhomeworkai.app";
export const DEMO_PASSWORD = "StemHomework2026!";

export function isDemoEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}
