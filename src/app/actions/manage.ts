"use server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { revalidatePath } from "next/cache";

export async function deleteFileAction(fileId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const fileRecord = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.uploaderId, session.user.id))
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

  // Update user quota
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id)
  });

  if (user) {
    await db.update(users)
      .set({ usedBytes: Math.max(0, user.usedBytes! - fileRecord.sizeBytes) })
      .where(eq(users.id, session.user.id));
  }

  // Delete from DB
  await db.delete(files).where(eq(files.id, fileId));

  revalidatePath("/"); // refresh the main page data
  return { success: true };
}
