import { db } from "@/db";
import { uploadTickets, users } from "@/db/schema";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { createHash, randomBytes, randomInt } from "crypto";
import { isRevoked } from "@/lib/session-check";
import { isLockedOut, recordFailure } from "@/lib/rate-limit";
import { auth } from "@/auth";
import { readSession, removeSessionFiles } from "@/lib/upload-session";

// Upload from a public PC without signing in there (like signing in to a TV):
//  1. The PC creates a ticket and gets a secret token, kept only in memory, plus
//     a 6-digit pair code it shows as a QR code.
//  2. The owner opens /pair?code=… on their signed-in phone and approves it.
//  3. The PC shows which account approved (so someone who scanned the QR first
//     can't collect the upload), and after the person confirms, uploads one
//     bundle with the token in the X-Upload-Ticket header.
// A ticket only ever allows that one upload: no file list, deletion or account
// access, and it can be cancelled from the phone at any time.

export type UploadTicket = typeof uploadTickets.$inferSelect;

export const PAIR_TTL_MS = 5 * 60 * 1000; // to approve on the phone
export const APPROVED_TTL_MS = 10 * 60 * 1000; // to start the upload after approval
export const MAX_TICKET_AGE_MS = 6 * 60 * 60 * 1000; // whole upload, matches stale upload cleanup

const MAX_PAIR_FAILURES = 10;
const PAIR_LOCKOUT_SECONDS = 15 * 60;

export const isPairCode = (code: unknown): code is string => typeof code === "string" && /^\d{6}$/.test(code);

// A wrong pair code entered on the phone is a guess at someone else's PC:
// too many lock that account out of pairing for a while
export const isPairingLockedOut = (userId: string) => isLockedOut(`pair:${userId}`, MAX_PAIR_FAILURES);
export const recordPairFailure = (userId: string) => recordFailure(`pair:${userId}`, PAIR_LOCKOUT_SECONDS);

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** New ticket for a PC; the token is returned only here and never stored. */
export async function createTicket(userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  // Pair codes only need to be unique among tickets still waiting for approval
  let pairCode = "";
  for (let attempt = 0; ; attempt++) {
    pairCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const taken = await db.query.uploadTickets.findFirst({
      where: and(eq(uploadTickets.pairCode, pairCode), eq(uploadTickets.status, "pending"), gt(uploadTickets.expiresAt, new Date(now))),
      columns: { id: true },
    });
    if (!taken) break;
    if (attempt >= 9) throw new Error("Could not allocate a pair code");
  }

  const expiresAt = new Date(now + PAIR_TTL_MS);
  await db.insert(uploadTickets).values({
    tokenHash: hashToken(token),
    pairCode,
    device: describeDevice(userAgent),
    expiresAt,
  });
  return { token, pairCode, expiresAt };
}

/** Pending or approved tickets past their deadline count as expired. */
export function isExpired(ticket: UploadTicket) {
  if (ticket.createdAt.getTime() + MAX_TICKET_AGE_MS < Date.now()) return true;
  return (ticket.status === "pending" || ticket.status === "approved") && ticket.expiresAt.getTime() < Date.now();
}

/**
 * The ticket named by a request's X-Upload-Ticket header: undefined when the
 * request has none (a normal signed-in request), null when it's unknown or expired.
 */
export async function ticketFromHeaders(headers: Headers): Promise<UploadTicket | null | undefined> {
  const token = headers.get("x-upload-ticket");
  if (token === null) return undefined;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const ticket = await db.query.uploadTickets.findFirst({ where: eq(uploadTickets.tokenHash, hashToken(token)) });
  return ticket && !isExpired(ticket) ? ticket : null;
}

/** The approving user, if they can still upload (not deleted, banned or signed out everywhere since). */
export async function ticketOwner(ticket: UploadTicket) {
  if (!ticket.userId) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, ticket.userId) });
  if (!user || user.bannedAt) return null;
  // Logging out everywhere also ends tickets approved before it
  const approvedAt = ticket.approvedAt ? Math.floor(ticket.approvedAt.getTime() / 1000) : 0;
  if (isRevoked(approvedAt, user.sessionsValidAfter)) return null;
  return user;
}

/** Atomically move a ticket from one status to another; false if it wasn't in `from`. */
export async function transitionTicket(id: string, from: UploadTicket["status"], set: Partial<typeof uploadTickets.$inferInsert>) {
  const [row] = await db.update(uploadTickets)
    .set(set)
    .where(and(eq(uploadTickets.id, id), eq(uploadTickets.status, from)))
    .returning({ id: uploadTickets.id });
  return !!row;
}

/** End a ticket (from the PC or the phone), dropping an upload in progress. A finished one stays as is. */
export async function cancelTicketUpload(ticket: UploadTicket) {
  // Use the row as cancelled, not the copy passed in: the PC may have started
  // its upload since that was read
  const [cancelled] = await db.update(uploadTickets)
    .set({ status: "cancelled" })
    .where(and(eq(uploadTickets.id, ticket.id), ne(uploadTickets.status, "done")))
    .returning({ uploadId: uploadTickets.uploadId });
  if (cancelled?.uploadId) {
    const session = await readSession(cancelled.uploadId);
    if (session) await removeSessionFiles(cancelled.uploadId, session.files.length);
  }
}

/** Delete tickets old enough that they can't be in use. */
export async function cleanupTickets() {
  await db.delete(uploadTickets).where(lt(uploadTickets.createdAt, new Date(Date.now() - MAX_TICKET_AGE_MS)));
}

/** "ab***@hanyang.ac.kr": enough for the owner to recognise their account. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/** Browser and OS only, e.g. "Chrome · Windows". */
export function describeDevice(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Whale\//.test(ua) ? "Whale"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "알 수 없는 브라우저";
  const os = /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : "알 수 없는 OS";
  return `${browser} · ${os}`;
}

/**
 * Who may touch an upload in progress: the signed-in user, or a PC whose ticket
 * started this upload. Undefined if the request has neither.
 */
export async function uploaderOf(headers: Headers, uploadId: string): Promise<{ userId: string; ticket?: UploadTicket } | undefined> {
  const ticket = await ticketFromHeaders(headers);
  if (ticket === null) return undefined;
  if (ticket) {
    if (ticket.status !== "uploading" || ticket.uploadId !== uploadId || !ticket.userId) return undefined;
    return { userId: ticket.userId, ticket };
  }
  const session = await auth();
  return session?.user?.id ? { userId: session.user.id } : undefined;
}
