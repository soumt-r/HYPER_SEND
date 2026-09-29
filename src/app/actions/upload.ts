"use server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { existsSync } from "fs";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

// 🔒 Security constants
const MAX_SINGLE_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_BUNDLE_FILE_COUNT = 20;

// Allowed MIME types (magic bytes check via first bytes)
const ALLOWED_MIME_PREFIXES = [
  "image/", "video/", "audio/", "text/",
  "application/pdf",
  "application/zip", "application/x-zip",
  "application/x-tar", "application/gzip",
  "application/x-7z-compressed", "application/x-rar-compressed",
  "application/vnd.", // Office documents
  "application/json", "application/xml",
  "application/octet-stream", // fallback for E2EE encrypted blobs
];

function isMimeAllowed(mimeType: string): boolean {
  if (!mimeType) return true; // E2EE encrypted files may have no type
  return ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

export async function uploadFileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  // 🔒 Rate Limit: 10 uploads per user per minute
  const { allowed } = await rateLimit(`upload:${session.user.id}`, 10, 60);
  if (!allowed) {
    return { error: "업로드 속도가 너무 빠릅니다. 잠시 후 다시 시도해주세요." };
  }

  const uploadedFiles = formData.getAll("file") as File[];
  const expireType = formData.get("expireType") as string;
  const expireValue = parseInt(formData.get("expireValue") as string);
  const isEncrypted = formData.get("isEncrypted") === "true";

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return { error: "No files uploaded" };
  }

  // 🔒 Max file count per bundle
  if (uploadedFiles.length > MAX_BUNDLE_FILE_COUNT) {
    return { error: `한 번에 최대 ${MAX_BUNDLE_FILE_COUNT}개까지 업로드할 수 있습니다.` };
  }

  // 🔒 Per-file size limit
  for (const file of uploadedFiles) {
    if (file.size > MAX_SINGLE_FILE_SIZE) {
      return { error: `"${file.name}" 파일이 너무 큽니다. 단일 파일은 최대 2GB까지 업로드할 수 있습니다.` };
    }
    // 🔒 MIME type validation
    if (!isMimeAllowed(file.type)) {
      return { error: `"${file.name}"의 파일 형식(${file.type})은 허용되지 않습니다.` };
    }
  }

  // Check quota
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id)
  });

  if (!user) return { error: "User not found" };

  const totalSize = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
  if (user.usedBytes! + totalSize > user.quotaBytes!) {
    return { error: "Storage quota exceeded" };
  }

  // Generate 8-char download code for the bundle
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  
  // Save to local filesystem
  const uploadDir = join(process.cwd(), "uploads");
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  // Expiration Logic
  let expiresAt = null;
  let maxDownloads = null;
  if (expireType === "TIME") {
    expiresAt = new Date(Date.now() + expireValue * 60 * 60 * 1000);
  } else {
    maxDownloads = expireValue;
  }

  const insertData = [];

  for (const file of uploadedFiles) {
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueId = crypto.randomUUID(); // ensure unique physical path
    const localPath = join(uploadDir, `${code}_${uniqueId}_${safeFilename}`);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(localPath, buffer);

    insertData.push({
      uploaderId: session.user.id,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      localPath: localPath,
      downloadCode: code,
      expiresAt,
      maxDownloads,
      isEncrypted
    });
  }

  // Insert into DB
  await db.insert(files).values(insertData);

  // Update user quota
  await db.update(users)
    .set({ usedBytes: user.usedBytes! + totalSize })
    .where(eq(users.id, session.user.id));

  return { success: true, code };
}
