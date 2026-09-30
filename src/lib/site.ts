// Runtime settings from the server's .env (read at request time, not baked into the image)

/** Operator contact for reports and privacy requests (CONTACT_EMAIL); null if not set. */
export function getContactEmail(): string | null {
  const email = process.env.CONTACT_EMAIL?.trim();
  return email ? email : null;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && !!process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL;
}
