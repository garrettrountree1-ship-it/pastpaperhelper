/** The single platform-owner account. Everything else is a teacher or student. */
export const ADMIN_EMAIL = "admin@stemhomeworkai.app";

export function isAdminEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}
