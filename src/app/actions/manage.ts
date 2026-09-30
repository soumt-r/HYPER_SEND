"use server";
import { getVerifiedUser } from "@/lib/session-check";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { revalidatePath } from "next/cache";

export async function deleteFileAction(fileId: string) {
  const verified = await getVerifiedUser();
  if (!verified) return { error: "Unauthorized" };
  const userId = verified.user.id;

  const fileRecord = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.uploaderId, userId))
  });

  if (!fileRecord) return { error: "File not found or permission denied" };

  // Delete from filesystem
  if (existsSync(fileRecord.localPath)) {
    try {
      await unlink(fileRecord.localPath);
    } catch (e) {
      console.error("Failed to delete file from disk:", e);
    }
  }

  // Update user quota atomically
  await db.update(users)
    .set({ usedBytes: sql`GREATEST(0, ${users.usedBytes} - ${fileRecord.sizeBytes})` })
    .where(eq(users.id, userId));

  // Delete from DB
  await db.delete(files).where(eq(files.id, fileId));

  revalidatePath("/"); // refresh the main page data
  return { success: true };
}
