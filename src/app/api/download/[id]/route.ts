import { db } from "@/db";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { resolve } from "path";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;

  // 🔒 Rate Limit: 30 downloads per IP per minute
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const { allowed, remaining } = await rateLimit(`download:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, {
      status: 429,
      headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" },
    });
  }

  // Validate ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
  }

  // Find file in DB
  const fileRecord = await db.query.files.findFirst({
    where: eq(files.id, id)
  });

  if (!fileRecord) {
    return NextResponse.json({ error: "File not found or expired." }, { status: 404 });
  }

  // 🔒 Path Traversal Protection: ensure localPath is within the uploads directory
  const uploadsDir = resolve(process.cwd(), "uploads");
  const resolvedPath = resolve(fileRecord.localPath);
  if (!resolvedPath.startsWith(uploadsDir + "/") && resolvedPath !== uploadsDir) {
    console.error(`[Security] Path traversal attempt blocked: ${fileRecord.localPath}`);
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  // Check Time expiration
  if (fileRecord.expiresAt && fileRecord.expiresAt < new Date()) {
    // Optionally: Clean up db and local file here
    return NextResponse.json({ error: "File link has expired." }, { status: 410 });
  }

  // Check Count expiration
  if (fileRecord.maxDownloads && fileRecord.currentDownloads! >= fileRecord.maxDownloads) {
    return NextResponse.json({ error: "Download limit exceeded." }, { status: 410 });
  }

  // Check file exists physically
  if (!existsSync(fileRecord.localPath)) {
    return NextResponse.json({ error: "File data missing." }, { status: 404 });
  }

  // Read file
  const fileBuffer = await readFile(fileRecord.localPath);

  // Update download count if needed
  if (fileRecord.maxDownloads) {
    const newCount = fileRecord.currentDownloads! + 1;
    if (newCount >= fileRecord.maxDownloads) {
      // Auto delete
      import("fs").then(fs => {
        try { fs.unlinkSync(fileRecord.localPath); } catch (e) {}
      });
      await db.delete(files).where(eq(files.id, fileRecord.id));
      
      const { users } = await import("@/db/schema");
      const { sql } = await import("drizzle-orm");
      await db.update(users)
        .set({ usedBytes: sql`${users.usedBytes} - ${fileRecord.sizeBytes}` })
        .where(eq(users.id, fileRecord.uploaderId));
    } else {
      await db.update(files)
        .set({ currentDownloads: newCount })
        .where(eq(files.id, fileRecord.id));
    }
  }

  // Return as downloadable file
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"`,
      "Content-Type": fileRecord.mimeType || "application/octet-stream",
      "Content-Length": fileRecord.sizeBytes.toString(),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
