"use server";
import { db } from "@/db";
import { uploadTickets } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { signIn } from "@/auth";
import { getVerifiedUser } from "@/lib/session-check";
import {
  APPROVED_TTL_MS, cancelTicketUpload, isExpired, isPairCode, isPairingLockedOut, recordPairFailure,
} from "@/lib/upload-ticket";

// Upload tickets, from the owner's signed-in phone (see lib/upload-ticket.ts)

/** Sign in on the phone, then come back to the same pair code. */
export async function loginForPairing(code: string) {
  await signIn("google", { redirectTo: isPairCode(code) ? `/pair?code=${code}` : "/pair" });
}

export async function approveTicket(code: string): Promise<{ ticketId?: string; error?: string }> {
  const verified = await getVerifiedUser();
  if (!verified) return { error: "로그인이 필요해요." };
  const userId = verified.user.id;
  if (await isPairingLockedOut(userId)) return { error: "코드를 너무 많이 틀렸어요. 15분 후 다시 시도해주세요." };

  const now = new Date();
  const [approved] = isPairCode(code) ? await db.update(uploadTickets)
    .set({ status: "approved", userId, approvedAt: now, expiresAt: new Date(now.getTime() + APPROVED_TTL_MS) })
    .where(and(eq(uploadTickets.pairCode, code), eq(uploadTickets.status, "pending"), gt(uploadTickets.expiresAt, now)))
    .returning({ id: uploadTickets.id }) : [];
  if (!approved) {
    await recordPairFailure(userId);
    return { error: "코드가 없거나 이미 쓰였거나 만료됐어요. PC 화면의 새 코드로 다시 시도해주세요." };
  }
  return { ticketId: approved.id };
}

/** "Not me": turn down a request without approving it. */
export async function denyTicket(code: string) {
  const verified = await getVerifiedUser();
  if (!verified || await isPairingLockedOut(verified.user.id)) return;
  const [denied] = isPairCode(code) ? await db.update(uploadTickets)
    .set({ status: "cancelled" })
    .where(and(eq(uploadTickets.pairCode, code), eq(uploadTickets.status, "pending")))
    .returning({ id: uploadTickets.id }) : [];
  if (!denied) await recordPairFailure(verified.user.id);
}

async function myTicket(ticketId: string) {
  const verified = await getVerifiedUser();
  if (!verified || typeof ticketId !== "string") return null;
  const ticket = await db.query.uploadTickets.findFirst({
    where: and(eq(uploadTickets.id, ticketId), eq(uploadTickets.userId, verified.user.id)),
  });
  return ticket ?? null;
}

/** Live status of a ticket I approved, for the phone to follow the upload. */
export async function getMyTicket(ticketId: string) {
  const ticket = await myTicket(ticketId);
  if (!ticket) return null;
  return {
    status: isExpired(ticket) ? "expired" as const : ticket.status,
    resultCode: ticket.resultCode,
  };
}

/** Withdraw an approval; an upload in progress from that PC is discarded. */
export async function cancelMyTicket(ticketId: string) {
  const ticket = await myTicket(ticketId);
  if (ticket) await cancelTicketUpload(ticket);
}
