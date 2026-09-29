import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";

// Chunked uploads: the client sends each file in pieces (to stay under Cloudflare's
// 100MB request limit), and the server appends them to .part files under uploads/.tmp.
// A JSON meta file per upload session records who started it and what was declared.

export const CHUNK_SIZE = 50 * 1024 * 1024; // what the client sends
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024; // what the server accepts per request
export const MAX_SINGLE_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_BUNDLE_FILE_COUNT = 20;
export const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

export const UPLOADS_DIR = join(process.cwd(), "uploads");
export const TMP_DIR = join(UPLOADS_DIR, ".tmp");

export type UploadSession = {
  userId: string;
  createdAt: number;
  expireType: string;
  expireValue: number;
  isEncrypted: boolean;
  files: { name: string; type: string; size: number }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSessionId = (id: string) => UUID_RE.test(id);

export const metaPath = (id: string) => join(TMP_DIR, `${id}.json`);
export const partPath = (id: string, index: number) => join(TMP_DIR, `${id}_${index}.part`);

export async function ensureTmpDir() {
  await mkdir(TMP_DIR, { recursive: true });
}

export async function writeSession(id: string, session: UploadSession) {
  await writeFile(metaPath(id), JSON.stringify(session));
}

export async function readSession(id: string): Promise<UploadSession | null> {
  if (!isSessionId(id)) return null;
  try {
    return JSON.parse(await readFile(metaPath(id), "utf-8"));
  } catch {
    return null;
  }
}

export async function fileSizeOrZero(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

export async function removeSessionFiles(id: string, fileCount: number) {
  await Promise.all([
    unlink(metaPath(id)).catch(() => {}),
    ...Array.from({ length: fileCount }, (_, i) => unlink(partPath(id, i)).catch(() => {})),
  ]);
}

/** Bytes a user has declared in upload sessions that haven't completed yet. */
export async function pendingBytesForUser(userId: string) {
  let total = 0;
  const names = await readdir(TMP_DIR).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const session = await readSession(name.slice(0, -5));
    if (session?.userId === userId) {
      total += session.files.reduce((acc, f) => acc + f.size, 0);
    }
  }
  return total;
}

/** Delete temp files of sessions that stopped receiving data. */
export async function cleanupStaleSessions() {
  const names = await readdir(TMP_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - STALE_SESSION_MS;
  for (const name of names) {
    const path = join(TMP_DIR, name);
    try {
      if ((await stat(path)).mtimeMs < cutoff) await unlink(path);
    } catch {}
  }
}
