import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// JWT sessions can't be revoked on their own, so each user has a cutoff
// (sessionsValidAfter): tokens from a login before it are rejected. Logging out
// moves the cutoff to now, which also invalidates copies of the token elsewhere.
// This is checked only where a request already reads the user row; upload
// chunks skip it, but every upload starts and ends with a checked request.

/** Compared in whole seconds, the precision of the token's login time. */
export function isRevoked(loginAt: number | undefined, sessionsValidAfter: Date | null | undefined) {
  if (!sessionsValidAfter) return false;
  return (loginAt ?? 0) < Math.floor(sessionsValidAfter.getTime() / 1000);
}

/** auth() plus the revocation check; null if not signed in, the user is gone, or the token was revoked. */
export async function getVerifiedUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user || isRevoked(session.loginAt, user.sessionsValidAfter)) return null;

  return { session, user };
}
