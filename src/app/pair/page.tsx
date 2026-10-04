import { db } from "@/db";
import { uploadTickets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getVerifiedUser } from "@/lib/session-check";
import { isExpired, isPairCode, isPairingLockedOut, maskEmail, recordPairFailure } from "@/lib/upload-ticket";
import Link from "next/link";
import PairApproval, { PairLogin } from "@/components/PairApproval";

// Opened on the owner's phone (from the QR code on a public PC) to let that PC
// upload one bundle into their account. See lib/upload-ticket.ts.
export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = isPairCode(raw) ? raw : null;
  const verified = await getVerifiedUser();

  let body: React.ReactNode;
  if (!verified) {
    body = (
      <>
        <p>공용 PC에서 업로드하려면, 이 기기에서 학교 계정으로 로그인한 뒤 승인해주세요.</p>
        <PairLogin code={code ?? ""} />
      </>
    );
  } else if (!code) {
    body = (
      <form method="get" className="flex flex-col gap-4">
        <label htmlFor="code">공용 PC 화면에 보이는 6자리 숫자를 입력하세요.</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="font-mono text-3xl tracking-[0.3em] border-b-[1.5px] border-[#111111] bg-transparent outline-none pb-2 w-48"
        />
        <button type="submit" className="self-start px-6 py-3 bg-[#111111] text-white font-mono text-[10px] tracking-widest">[ NEXT ]</button>
      </form>
    );
  } else if (await isPairingLockedOut(verified.user.id)) {
    body = <p className="text-red-500">코드를 너무 많이 틀렸어요. 15분 후 다시 시도해주세요.</p>;
  } else {
    const ticket = await db.query.uploadTickets.findFirst({
      where: eq(uploadTickets.pairCode, code),
      orderBy: [desc(uploadTickets.createdAt)],
    });
    const mine = ticket?.userId === verified.user.id && !isExpired(ticket);
    if (ticket && (mine || (ticket.status === "pending" && !isExpired(ticket)))) {
      body = (
        <PairApproval
          code={code}
          account={maskEmail(verified.user.email)}
          device={ticket.device ?? ""}
          requestedAt={ticket.createdAt.toISOString()}
          approvedTicketId={mine ? ticket.id : null}
        />
      );
    } else {
      await recordPairFailure(verified.user.id);
      body = (
        <>
          <p>코드가 없거나 이미 쓰였거나 만료됐어요. PC 화면에서 새 코드를 받아 다시 시도해주세요.</p>
          <a href="/pair" className="font-mono text-xs text-[#2549BB] underline">다른 코드 입력</a>
        </>
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#111111] font-sans p-8 md:p-16">
      <div className="max-w-md mx-auto space-y-8">
        <header className="border-b-[0.5px] border-[#EEEEEE] pb-6">
          <h1 className="font-mono text-xl tracking-tighter uppercase font-bold">Public PC Upload</h1>
          <p className="font-mono text-xs text-[#999999] mt-2">공용 PC에서 로그인 없이 올리기</p>
        </header>
        <div className="text-sm leading-relaxed text-[#555555] space-y-6">{body}</div>
        <Link href="/" className="block font-mono text-xs text-[#2549BB] underline">← BACK TO HOME</Link>
      </div>
    </div>
  );
}
