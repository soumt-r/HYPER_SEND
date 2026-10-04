import { NextRequest, NextResponse } from "next/server";
import { readSession, removeSessionFiles } from "@/lib/upload-session";
import { cancelTicketUpload, uploaderOf } from "@/lib/upload-ticket";

// Cancel an upload session and delete what was received so far
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uploader = await uploaderOf(request.headers, id);
  if (!uploader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await readSession(id);
  if (!session || session.userId !== uploader.userId) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  await removeSessionFiles(id, session.files.length);
  // A cancelled upload also ends the ticket it used
  if (uploader.ticket) await cancelTicketUpload(uploader.ticket);
  return NextResponse.json({ success: true });
}
