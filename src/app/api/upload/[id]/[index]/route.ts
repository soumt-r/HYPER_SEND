import { auth } from "@/auth";
import { open, utimes } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { MAX_CHUNK_BYTES, fileSizeOrZero, metaPath, partPath, readSession } from "@/lib/upload-session";

// Part files being written right now. Two requests for the same part could both
// pass the offset check and append twice, writing more than the declared size.
const globalWriting = globalThis as typeof globalThis & { __uploadWriting?: Set<string> };
const writing = globalWriting.__uploadWriting ??= new Set();

// Append one chunk to a file of an upload session.
// `offset` must equal the bytes already received, so a retried or duplicated
// chunk is rejected with 409 and the client resumes from `received`.
// A chunk is all-or-nothing: if fewer than `length` bytes arrive, it's discarded,
// so `received` always lands on a chunk boundary (needed to resume encrypted uploads).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, index: indexParam } = await params;
  const session = await readSession(id);
  if (!session || session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  const index = Number(indexParam);
  const file = Number.isInteger(index) ? session.files[index] : undefined;
  if (!file) {
    return NextResponse.json({ error: "Invalid file index" }, { status: 400 });
  }

  const path = partPath(id, index);
  if (writing.has(path)) {
    return NextResponse.json({ error: "Chunk already in progress", received: await fileSizeOrZero(path) }, { status: 409 });
  }
  writing.add(path);
  try {
    return await writeChunk(request, id, path, file.size);
  } finally {
    writing.delete(path);
  }
}

async function writeChunk(request: NextRequest, id: string, path: string, fileSize: number) {
  const received = await fileSizeOrZero(path);
  const offset = Number(request.nextUrl.searchParams.get("offset"));
  if (offset !== received) {
    return NextResponse.json({ error: "Offset mismatch", received }, { status: 409 });
  }
  const length = Number(request.nextUrl.searchParams.get("length"));
  if (!Number.isInteger(length) || length < 1 || length > MAX_CHUNK_BYTES || received + length > fileSize) {
    return NextResponse.json({ error: "Invalid chunk length" }, { status: 413 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
  }

  let written = 0;
  let complete = false;
  const handle = await open(path, "a");
  try {
    // Stream the request body straight to disk
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      written += chunk.byteLength;
      if (written > length) break;
      await handle.write(chunk);
    }
    complete = written === length;
  } catch {
    // Client disconnected mid-chunk
  } finally {
    if (!complete) await handle.truncate(received).catch(() => {});
    await handle.close();
  }
  if (!complete) {
    return NextResponse.json({ error: "Incomplete chunk", received }, { status: 400 });
  }

  // Keep the session from being cleaned up as stale while it's still active
  const now = new Date();
  await utimes(metaPath(id), now, now).catch(() => {});

  return NextResponse.json({ received: received + written });
}
