import { db } from "@/db";
import { files } from "@/db/schema";
import { sql } from "drizzle-orm";
import { statfs } from "fs/promises";
import { UPLOADS_DIR, pendingUploadBytes } from "@/lib/upload-session";

const GB = 1024 * 1024 * 1024;

// Keep this much disk free for Postgres, logs and the OS (MIN_FREE_DISK_GB, default 2)
function minFreeBytes() {
  const gb = Number(process.env.MIN_FREE_DISK_GB);
  return (Number.isFinite(gb) && gb >= 0 ? gb : 2) * GB;
}

// Optional cap on the total size of all stored files (STORAGE_LIMIT_GB, unset = no cap)
function storageLimitBytes() {
  const gb = Number(process.env.STORAGE_LIMIT_GB);
  return Number.isFinite(gb) && gb > 0 ? gb * GB : null;
}

export async function getDiskStats() {
  const stats = await statfs(UPLOADS_DIR);
  return { freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize };
}

/**
 * Whether the server can take `bytes` more, counting uploads that are in progress
 * but haven't been written yet. Returns an error message, or null if there's room.
 */
export async function checkServerStorage(bytes: number): Promise<string | null> {
  const pending = await pendingUploadBytes();
  const notYetWritten = Math.max(0, pending.declared - pending.received);

  const { freeBytes } = await getDiskStats();
  if (freeBytes - notYetWritten - bytes < minFreeBytes()) {
    return "서버 저장 공간이 부족해요. 잠시 후 다시 시도해주세요.";
  }

  const limit = storageLimitBytes();
  if (limit !== null) {
    const [{ stored }] = await db.select({ stored: sql<number>`COALESCE(SUM(${files.sizeBytes}), 0)::bigint` }).from(files);
    if (Number(stored) + pending.declared + bytes > limit) {
      return "서비스 전체 저장 한도에 도달했어요. 잠시 후 다시 시도해주세요.";
    }
  }
  return null;
}
