"use server";
import { getVerifiedUser } from "@/lib/session-check";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { deleteFileRecords } from "@/lib/file-ops";
import { removeUserSessions } from "@/lib/upload-session";

export async function deleteFileAction(fileId: string) {
  const verified = await getVerifiedUser();
  if (!verified) return { error: "Unauthorized" };
  const userId = verified.user.id;

  const fileRecord = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.uploaderId, userId))
  });

  if (!fileRecord) return { error: "File not found or permission denied" };

  await deleteFileRecords([fileRecord]);

  revalidatePath("/"); // refresh the main page data
  return { success: true };
}

/** Delete the signed-in user's files and account (accounts/sessions cascade), then sign out. */
export async function deleteAccountAction() {
  const verified = await getVerifiedUser();
  if (!verified) return { error: "Unauthorized" };
  const userId = verified.user.id;

  const records = await db.query.files.findMany({ where: eq(files.uploaderId, userId) });
  await deleteFileRecords(records);
  await removeUserSessions(userId);
  await db.delete(users).where(eq(users.id, userId));

  await signOut({ redirectTo: "/" });
}
