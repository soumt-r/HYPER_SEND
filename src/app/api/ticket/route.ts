import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cancelTicketUpload, createTicket, maskEmail, ticketFromHeaders } from "@/lib/upload-ticket";

// Upload tickets, from the public PC's side (see lib/upload-ticket.ts).
// The PC authenticates with its ticket token in the X-Upload-Ticket header.

/** Start: returns the token (keep it in memory only) and the code to show as a QR. */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`ticket:${ip}`, 10, 10 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }
  const { token, pairCode, expiresAt } = await createTicket(request.headers.get("user-agent"));
  return NextResponse.json({ token, pairCode, expiresAt });
}

/** Poll: status, and once approved, the masked account it was approved for. */
export async function GET(request: NextRequest) {
  const ticket = await ticketFromHeaders(request.headers);
  if (!ticket) return NextResponse.json({ status: "expired" });

  let account: string | null = null;
  if (ticket.userId) {
    const owner = await db.query.users.findFirst({ where: eq(users.id, ticket.userId), columns: { email: true } });
    account = maskEmail(owner?.email);
  }
  return NextResponse.json({ status: ticket.status, account, expiresAt: ticket.expiresAt });
}

/** Cancel from the PC (closed, or "this isn't my account"). */
export async function DELETE(request: NextRequest) {
  const ticket = await ticketFromHeaders(request.headers);
  if (ticket) await cancelTicketUpload(ticket);
  return NextResponse.json({ success: true });
}
