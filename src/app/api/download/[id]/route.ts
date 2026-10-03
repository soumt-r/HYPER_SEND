import { db } from "@/db";
import { files, users } from "@/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { open, unlink } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "path";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// ASCII fallback plus RFC 5987 filename* so non-ASCII (e.g. Korean) names are saved correctly
function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7E]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;

  // 🔒 Rate Limit: 30 downloads per IP per minute
  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`download:${ip}`, 30, 60);
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
    return NextResponse.json({ error: "File link has expired." }, { status: 410 });
  }

  // Open the file before claiming a download, so a missing file doesn't use one up.
  // The open handle also keeps the data readable if the file is unlinked below.
  let handle;
  try {
    handle = await open(resolvedPath, "r");
  } catch {
    return NextResponse.json({ error: "File data missing." }, { status: 404 });
  }

  // 🔒 Atomically claim one download, so concurrent requests can't exceed maxDownloads
  if (fileRecord.maxDownloads) {
    const [claimed] = await db.update(files)
      .set({ currentDownloads: sql`${files.currentDownloads} + 1` })
      .where(and(
        eq(files.id, fileRecord.id),
        or(isNull(files.currentDownloads), lt(files.currentDownloads, fileRecord.maxDownloads))
      ))
      .returning({ currentDownloads: files.currentDownloads });

    if (!claimed) {
      await handle.close();
      return NextResponse.json({ error: "Download limit exceeded." }, { status: 410 });
    }

    // Last allowed download: remove the record and file now (the open handle still streams it)
    if (claimed.currentDownloads! >= fileRecord.maxDownloads) {
      await db.delete(files).where(eq(files.id, fileRecord.id));
      await db.update(users)
        .set({ usedBytes: sql`GREATEST(0, ${users.usedBytes} - ${fileRecord.sizeBytes})` })
        .where(eq(users.id, fileRecord.uploaderId));
      await unlink(resolvedPath).catch(() => {});
    }
  }

  // Stream from disk instead of buffering the whole file in memory
  const body = Readable.toWeb(handle.createReadStream()) as ReadableStream;

  return new NextResponse(body, {
    headers: {
      "Content-Disposition": contentDisposition(fileRecord.originalName),
      "Content-Type": fileRecord.mimeType || "application/octet-stream",
      "Content-Length": fileRecord.sizeBytes.toString(),
      "X-Content-Type-Options": "nosniff",
      // The type is declared by the uploader (e.g. text/html, image/svg+xml); if a
      // browser ever renders it instead of downloading, it gets no scripts or origin
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
