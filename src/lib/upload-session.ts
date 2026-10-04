import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";

// Chunked uploads: the client sends each file in pieces (to stay under Cloudflare's
// 100MB request limit), and the server appends them to .part files under uploads/.tmp.
// A JSON meta file per upload session records who started it and what was declared.

export const CHUNK_SIZE = 50 * 1024 * 1024; // what the client sends
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024; // what the server accepts per request
export const MAX_SINGLE_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_BUNDLE_FILE_COUNT = 20;
// Per user: shared files at once (empty files take no quota but still a DB row),
// and uploads in progress
export const MAX_ACTIVE_FILES_PER_USER = 200;
export const MAX_OPEN_UPLOADS_PER_USER = 5;
export const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

export const UPLOADS_DIR = join(process.cwd(), "uploads");
export const TMP_DIR = join(UPLOADS_DIR, ".tmp");

export type UploadSession = {
  userId: string;
  createdAt: number;
  expireType: string;
  expireValue: number;
  isEncrypted: boolean;
  // Encrypted bundles: salt and hash of the password-derived auth token (lib/bundle-auth.ts)
  auth?: { salt: string; hash: string };
  // Started from a public PC with this upload ticket (lib/upload-ticket.ts)
  ticketId?: string;
  // `meta` is the encrypted real name/type of a file in an encrypted bundle
  files: { name: string; type: string; size: number; meta?: string }[];
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

/** IDs and sessions of a user's uploads that haven't completed yet. */
async function sessionsOfUser(userId: string) {
  const found: { id: string; session: UploadSession }[] = [];
  const names = await readdir(TMP_DIR).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const session = await readSession(id);
    if (session?.userId === userId) found.push({ id, session });
  }
  return found;
}

/** What a user has declared in upload sessions that haven't completed yet. */
export async function pendingForUser(userId: string) {
  const open = await sessionsOfUser(userId);
  return {
    uploads: open.length,
    files: open.reduce((acc, { session }) => acc + session.files.length, 0),
    bytes: open.reduce((acc, { session }) => acc + session.files.reduce((sum, f) => sum + f.size, 0), 0),
  };
}

/** Cancel every upload in progress of a user (on ban or account deletion). */
export async function removeUserSessions(userId: string) {
  for (const { id, session } of await sessionsOfUser(userId)) {
    await removeSessionFiles(id, session.files.length);
  }
}

/** Bytes declared and already received across all uploads in progress. */
export async function pendingUploadBytes() {
  let declared = 0;
  let received = 0;
  const names = await readdir(TMP_DIR).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const session = await readSession(id);
    if (!session) continue;
    for (let i = 0; i < session.files.length; i++) {
      declared += session.files[i].size;
      received += await fileSizeOrZero(partPath(id, i));
    }
  }
  return { declared, received };
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
