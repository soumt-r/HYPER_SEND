import { db } from "@/db";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isLockedOut, rateLimit, recordFailure } from "@/lib/rate-limit";

// 🔒 Brute-force lockout: 10 wrong codes locks the IP out for 15 minutes
const MAX_FAILED_LOOKUPS = 10;
const LOCKOUT_SECONDS = 15 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  // 🔒 Rate Limit: 20 code lookups per IP per minute (brute-force protection)
  const ip = getClientIp(request.headers);
  if (await isLockedOut(`lookup:${ip}`, MAX_FAILED_LOOKUPS)) {
    return NextResponse.json({ error: "잘못된 코드를 너무 많이 입력했습니다. 15분 후 다시 시도해주세요." }, {
      status: 429,
      headers: { "Retry-After": String(LOCKOUT_SECONDS) },
    });
  }

  const { allowed } = await rateLimit(`lookup:${ip}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // Validate code format (8 hex chars)
  const code = (await params).code.toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const fileRecords = await db.query.files.findMany({
    where: eq(files.downloadCode, code)
  });

  if (!fileRecords || fileRecords.length === 0) {
    await recordFailure(`lookup:${ip}`, LOCKOUT_SECONDS);
    return NextResponse.json({ error: "No files found for this code." }, { status: 404 });
  }

  // Filter out expired ones (and optionally delete them, but we'll just filter for now)
  const validFiles = fileRecords.filter(file => {
    if (file.expiresAt && file.expiresAt < new Date()) return false;
    if (file.maxDownloads && file.currentDownloads! >= file.maxDownloads) return false;
    return true;
  });

  if (validFiles.length === 0) {
    return NextResponse.json({ error: "Files exist but have expired." }, { status: 410 });
  }

  // Map to safe public info
  const result = validFiles.map(f => ({
    id: f.id,
    originalName: f.originalName,
    sizeBytes: f.sizeBytes,
    isEncrypted: f.isEncrypted
  }));

  return NextResponse.json({ files: result });
}
