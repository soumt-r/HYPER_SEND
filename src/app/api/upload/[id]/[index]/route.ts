import { auth } from "@/auth";
import { open, utimes } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { MAX_CHUNK_BYTES, fileSizeOrZero, metaPath, partPath, readSession } from "@/lib/upload-session";

// Append one chunk to a file of an upload session.
// `offset` must equal the bytes already received, so a retried or duplicated
// chunk is rejected with 409 and the client resumes from `received`.
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
  const received = await fileSizeOrZero(path);
  const offset = Number(request.nextUrl.searchParams.get("offset"));
  if (offset !== received) {
    return NextResponse.json({ error: "Offset mismatch", received }, { status: 409 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
  }

  const limit = Math.min(MAX_CHUNK_BYTES, file.size - received);
  let written = 0;
  const handle = await open(path, "a");
  try {
    // Stream the request body straight to disk
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      written += chunk.byteLength;
      if (written > limit) {
        await handle.truncate(received);
        return NextResponse.json({ error: "Chunk exceeds declared file size" }, { status: 413 });
      }
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }

  // Keep the session from being cleaned up as stale while it's still active
  const now = new Date();
  await utimes(metaPath(id), now, now).catch(() => {});

  return NextResponse.json({ received: received + written });
}
