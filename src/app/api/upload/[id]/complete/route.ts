import { getVerifiedUser } from "@/lib/session-check";
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
import { ticketFromHeaders, ticketOwner, transitionTicket } from "@/lib/upload-ticket";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Signed in here, or the public PC whose ticket started this upload
  const ticket = await ticketFromHeaders(request.headers);
  const user = ticket === undefined
    ? (await getVerifiedUser())?.user
    : ticket?.status === "uploading" && ticket.uploadId === id ? await ticketOwner(ticket) : null;
  if (!user) {
    return NextResponse.json({ error: ticket === undefined ? "Unauthorized" : "업로드 승인이 만료되었거나 취소되었어요." }, { status: 401 });
  }
  const userId = user.id;

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

  // Generate an 8-char download code for the bundle. Codes are only 32 bits, so
  // check it isn't in use: a collision would show this bundle together with
  // someone else's files under one code.
  let code = "";
  for (let attempt = 0; ; attempt++) {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const taken = await db.query.files.findFirst({ where: eq(files.downloadCode, code), columns: { id: true } });
    if (!taken) break;
    if (attempt >= 4) {
      await db.update(users).set({ usedBytes: sql`GREATEST(0, ${users.usedBytes} - ${totalSize})` }).where(eq(users.id, userId));
      return fail("다운로드 코드를 만들지 못했어요. 다시 시도해주세요.", 503);
    }
  }
  // Upload from a public PC: finish its ticket now, so a cancel from the phone
  // can't race with publishing the files
  if (session.ticketId && !await transitionTicket(session.ticketId, "uploading", { status: "done", resultCode: code })) {
    await db.update(users).set({ usedBytes: sql`GREATEST(0, ${users.usedBytes} - ${totalSize})` }).where(eq(users.id, userId));
    return fail("취소된 업로드예요.", 409);
  }

  const insertData = [];
  for (let i = 0; i < session.files.length; i++) {
    const file = session.files[i];
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const localPath = join(UPLOADS_DIR, `${code}_${crypto.randomUUID()}_${safeFilename}`);
    if (file.size === 0) await writeFile(partPath(id, i), "");
    await rename(partPath(id, i), localPath);
    insertData.push({
      uploaderId: userId,
      // Encrypted bundles: the real name and type are only in encryptedMeta
      originalName: session.auth ? `encrypted-${i + 1}` : file.name,
      mimeType: session.auth ? "application/octet-stream" : file.type,
      sizeBytes: file.size,
      localPath,
      downloadCode: code,
      ...expiry,
      isEncrypted: session.isEncrypted,
      passwordHash: session.auth?.hash ?? null,
      authSalt: session.auth?.salt ?? null,
      encryptedMeta: file.meta ?? null,
      viaPublicPc: !!session.ticketId,
    });
  }

  await db.insert(files).values(insertData);
  await unlink(lockPath).catch(() => {});

  return NextResponse.json({ success: true, code });
}
