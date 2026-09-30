import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { unlink } from "fs/promises";

type FileRecord = typeof files.$inferSelect;

/** Delete files from disk and DB, and give the space back to each uploader's quota. */
export async function deleteFileRecords(records: FileRecord[]) {
  if (records.length === 0) return;

  await Promise.all(records.map((f) => unlink(f.localPath).catch(() => {})));
  await db.delete(files).where(inArray(files.id, records.map((f) => f.id)));

  const freedByUser = new Map<string, number>();
  for (const f of records) {
    freedByUser.set(f.uploaderId, (freedByUser.get(f.uploaderId) ?? 0) + f.sizeBytes);
  }
  for (const [userId, bytes] of freedByUser) {
    await db.update(users)
      .set({ usedBytes: sql`GREATEST(0, ${users.usedBytes} - ${bytes})` })
      .where(eq(users.id, userId));
  }
}
