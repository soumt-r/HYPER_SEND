import { getVerifiedUser } from "@/lib/session-check";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { checkServerStorage } from "@/lib/storage";
import { parseExpiry, MAX_DOWNLOAD_COUNT, MAX_EXPIRE_HOURS } from "@/lib/expiry";
import {
  MAX_BUNDLE_FILE_COUNT, MAX_SINGLE_FILE_SIZE,
  ensureTmpDir, pendingBytesForUser, writeSession,
} from "@/lib/upload-session";
import { NextRequest, NextResponse } from "next/server";

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

// type/subtype only: the value is sent back as the Content-Type of downloads
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function isMimeAllowed(mimeType: string): boolean {
  if (!mimeType) return true;
  if (!MIME_RE.test(mimeType)) return false;
  return ALLOWED_MIME_PREFIXES.some(prefix => mimeType.toLowerCase().startsWith(prefix));
}

// Start a chunked upload session. The client then PUTs each file's chunks to
// /api/upload/[id]/[index] and finishes with POST /api/upload/[id]/complete.
export async function POST(request: NextRequest) {
  const verified = await getVerifiedUser();
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user } = verified;
  const userId = user.id;

  // Rate limit
  const { allowed } = await rateLimit(`upload:${userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "업로드 속도가 너무 빠릅니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const declared: unknown = body?.files;
  if (!Array.isArray(declared) || declared.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  if (!parseExpiry(body.expireType, body.expireValue)) {
    return NextResponse.json({ error: `만료 조건이 올바르지 않습니다. (다운로드 1~${MAX_DOWNLOAD_COUNT}회 또는 1~${MAX_EXPIRE_HOURS}시간)` }, { status: 400 });
  }

  if (declared.length > MAX_BUNDLE_FILE_COUNT) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_BUNDLE_FILE_COUNT}개까지 업로드할 수 있습니다.` }, { status: 400 });
  }

  const uploadFiles = [];
  for (const f of declared) {
    const name = typeof f?.name === "string" ? f.name.slice(0, 255) : "";
    const type = typeof f?.type === "string" ? f.type.slice(0, 255) : "";
    const size = Number(f?.size);
    if (!name || !Number.isInteger(size) || size < 0) {
      return NextResponse.json({ error: "Invalid file info" }, { status: 400 });
    }
    if (size > MAX_SINGLE_FILE_SIZE) {
      return NextResponse.json({ error: `"${name}" 파일이 너무 큽니다. 단일 파일은 최대 2GB까지 업로드할 수 있습니다.` }, { status: 400 });
    }
    if (!isMimeAllowed(type)) {
      return NextResponse.json({ error: `"${name}"의 파일 형식(${type})은 허용되지 않습니다.` }, { status: 400 });
    }
    uploadFiles.push({ name, type, size });
  }

  // Check quota, counting uploads this user has started but not finished
  const totalSize = uploadFiles.reduce((acc, f) => acc + f.size, 0);
  const pending = await pendingBytesForUser(userId);
  if (user.usedBytes! + pending + totalSize > user.quotaBytes!) {
    return NextResponse.json({ error: "Storage quota exceeded" }, { status: 400 });
  }

  // 🔒 Server-wide limit: keep the disk from filling up
  const storageError = await checkServerStorage(totalSize);
  if (storageError) {
    return NextResponse.json({ error: storageError }, { status: 507 });
  }

  const id = crypto.randomUUID();
  await ensureTmpDir();
  await writeSession(id, {
    userId,
    createdAt: Date.now(),
    expireType: body.expireType,
    expireValue: Number(body.expireValue),
    isEncrypted: body.isEncrypted === true,
    files: uploadFiles,
  });

  return NextResponse.json({ id });
}
