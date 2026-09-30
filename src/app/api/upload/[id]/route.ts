import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { readSession, removeSessionFiles } from "@/lib/upload-session";

// Cancel an upload session and delete what was received so far
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const session = await readSession(id);
  if (!session || session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  await removeSessionFiles(id, session.files.length);
  return NextResponse.json({ success: true });
}
