import { auth } from "@/auth";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { rename, unlink, writeFile } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseExpiry } from "@/lib/expiry";
import {
  UPLOADS_DIR, fileSizeOrZero, metaPath, partPath, readSession, removeSessionFiles,
} from "@/lib/upload-session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authSession.user.id;

  const { id } = await params;
  const session = await readSession(id);
  if (!session || session.userId !== userId) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  // Every file must have been received in full
  for (let i = 0; i < session.files.length; i++) {
    const received = await fileSizeOrZero(partPath(id, i));
    if (received !== session.files[i].size) {
      return NextResponse.json({ error: `"${session.files[i].name}" 업로드가 완료되지 않았습니다.` }, { status: 400 });
    }
  }

  // Claim the session: rename is atomic, so a duplicate complete request gets 409
  const lockPath = `${metaPath(id)}.completing`;
  try {
    await rename(metaPath(id), lockPath);
  } catch {
    return NextResponse.json({ error: "Upload already completed" }, { status: 409 });
  }

  const fail = async (error: string, status: number) => {
    await removeSessionFiles(id, session.files.length);
    await unlink(lockPath).catch(() => {});
    return NextResponse.json({ error }, { status });
  };

  const expiry = parseExpiry(session.expireType, session.expireValue);
  if (!expiry) return fail("만료 조건이 올바르지 않습니다.", 400);

  // 🔒 Reserve quota atomically
  const totalSize = session.files.reduce((acc, f) => acc + f.size, 0);
  const [reserved] = await db.update(users)
    .set({ usedBytes: sql`${users.usedBytes} + ${totalSize}` })
    .where(and(eq(users.id, userId), sql`${users.usedBytes} + ${totalSize} <= ${users.quotaBytes}`))
    .returning({ id: users.id });
  if (!reserved) return fail("Storage quota exceeded", 400);

  // Generate 8-char download code for the bundle
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const insertData = [];
  for (let i = 0; i < session.files.length; i++) {
    const file = session.files[i];
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const localPath = join(UPLOADS_DIR, `${code}_${crypto.randomUUID()}_${safeFilename}`);
    if (file.size === 0) await writeFile(partPath(id, i), "");
    await rename(partPath(id, i), localPath);
    insertData.push({
      uploaderId: userId,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      localPath,
      downloadCode: code,
      ...expiry,
      isEncrypted: session.isEncrypted,
    });
  }

  await db.insert(files).values(insertData);
  await unlink(lockPath).catch(() => {});

  return NextResponse.json({ success: true, code });
}
