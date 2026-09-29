import { auth } from "@/auth";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { existsSync } from "fs";
import { rateLimit } from "@/lib/rate-limit";
import { parseExpiry, MAX_DOWNLOAD_COUNT, MAX_EXPIRE_HOURS } from "@/lib/expiry";
import { NextRequest, NextResponse } from "next/server";

const MAX_SINGLE_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_BUNDLE_FILE_COUNT = 20;
const ALLOWED_MIME_PREFIXES = [
  "image/", "video/", "audio/", "text/",
  "application/pdf",
  "application/zip", "application/x-zip",
  "application/x-tar", "application/gzip",
  "application/x-7z-compressed", "application/x-rar-compressed",
  "application/vnd.",
  "application/json", "application/xml",
  "application/octet-stream",
];

function isMimeAllowed(mimeType: string): boolean {
  if (!mimeType) return true;
  return ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const { allowed } = await rateLimit(`upload:${session.user.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "업로드 속도가 너무 빠릅니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const formData = await request.formData();
  const uploadedFiles = formData.getAll("file") as File[];
  const expiry = parseExpiry(formData.get("expireType"), formData.get("expireValue"));
  const isEncrypted = formData.get("isEncrypted") === "true";

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  if (!expiry) {
    return NextResponse.json({ error: `만료 조건이 올바르지 않습니다. (다운로드 1~${MAX_DOWNLOAD_COUNT}회 또는 1~${MAX_EXPIRE_HOURS}시간)` }, { status: 400 });
  }

  if (uploadedFiles.length > MAX_BUNDLE_FILE_COUNT) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_BUNDLE_FILE_COUNT}개까지 업로드할 수 있습니다.` }, { status: 400 });
  }

  for (const file of uploadedFiles) {
    if (file.size > MAX_SINGLE_FILE_SIZE) {
      return NextResponse.json({ error: `"${file.name}" 파일이 너무 큽니다. 단일 파일은 최대 2GB까지 업로드할 수 있습니다.` }, { status: 400 });
    }
    if (!isMimeAllowed(file.type)) {
      return NextResponse.json({ error: `"${file.name}"의 파일 형식(${file.type})은 허용되지 않습니다.` }, { status: 400 });
    }
  }

  // Check quota
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const totalSize = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
  if (user.usedBytes! + totalSize > user.quotaBytes!) {
    return NextResponse.json({ error: "Storage quota exceeded" }, { status: 400 });
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const uploadDir = join(process.cwd(), "uploads");
  if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

  const insertData = [];
  for (const file of uploadedFiles) {
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueId = crypto.randomUUID();
    const localPath = join(uploadDir, `${code}_${uniqueId}_${safeFilename}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(localPath, buffer);
    insertData.push({
      uploaderId: session.user.id,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      localPath,
      downloadCode: code,
      ...expiry,
      isEncrypted,
    });
  }

  await db.insert(files).values(insertData);
  await db.update(users)
    .set({ usedBytes: sql`${users.usedBytes} + ${totalSize}` })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true, code });
}
