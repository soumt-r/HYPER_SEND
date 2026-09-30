"use server";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getVerifiedUser } from "@/lib/session-check";
import { isAdminEmail } from "@/lib/site";
import { deleteFileRecords } from "@/lib/file-ops";

async function requireAdmin() {
  const verified = await getVerifiedUser();
  if (!verified || !isAdminEmail(verified.user.email)) throw new Error("Forbidden");
  return verified.user;
}

/** Take down every file shared under a download code (e.g. after a report). */
export async function adminDeleteBundle(code: string) {
  await requireAdmin();
  const records = await db.query.files.findMany({ where: eq(files.downloadCode, code) });
  await deleteFileRecords(records);
  revalidatePath("/admin");
}

/**
 * Ban or unban a user. Banning also signs them out everywhere and removes
 * everything they've shared.
 */
export async function adminSetBan(userId: string, banned: boolean) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Can't ban yourself");

  if (banned) {
    const now = new Date();
    await db.update(users).set({ bannedAt: now, sessionsValidAfter: now }).where(eq(users.id, userId));
    const records = await db.query.files.findMany({ where: eq(files.uploaderId, userId) });
    await deleteFileRecords(records);
  } else {
    await db.update(users).set({ bannedAt: null }).where(eq(users.id, userId));
  }
  revalidatePath("/admin");
}
