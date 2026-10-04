"use client";
import { useEffect, useState, useTransition } from "react";
import { approveTicket, cancelMyTicket, denyTicket, getMyTicket, loginForPairing } from "@/app/actions/ticket";

type Status = "pending" | "approved" | "uploading" | "done" | "cancelled" | "expired";

const button = "px-6 py-3 font-mono text-[10px] tracking-widest uppercase border-[0.5px] transition-colors disabled:opacity-50";

export function PairLogin({ code }: { code: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => loginForPairing(code))}
      disabled={isPending}
      className={`${button} bg-[#111111] text-white border-[#111111]`}
    >
      {isPending ? "Connecting..." : "[ 학교 계정으로 로그인 ]"}
    </button>
  );
}

/** Approve a public PC's upload request, then follow it until the bundle's code is out. */
export default function PairApproval({ code, account, device, requestedAt, approvedTicketId }: {
  code: string;
  account: string;
  device: string;
  requestedAt: string;
  approvedTicketId: string | null;
}) {
  const [ticketId, setTicketId] = useState(approvedTicketId);
  const [status, setStatus] = useState<Status>(approvedTicketId ? "approved" : "pending");
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // After approval, follow the PC's progress
  useEffect(() => {
    if (!ticketId) return;
    let stopped = false;
    const poll = async () => {
      const t = await getMyTicket(ticketId).catch(() => null);
      if (stopped || !t) return;
      setStatus(t.status);
      setResultCode(t.resultCode);
      if (t.status === "done" || t.status === "cancelled" || t.status === "expired") stopped = true;
    };
    poll();
    const timer = setInterval(() => { if (!stopped) poll(); }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [ticketId]);

  if (status === "pending") {
    return (
      <div className="space-y-6">
        <div className="border-[0.5px] border-[#E5E5E5] p-5 space-y-2 font-mono text-xs">
          <div><span className="text-[#999999]">CODE</span> <span className="text-lg tracking-[0.3em] text-[#111111]">{code}</span></div>
          <div><span className="text-[#999999]">DEVICE</span> {device}</div>
          <div><span className="text-[#999999]">REQUESTED</span> {new Date(requestedAt).toLocaleTimeString("ko-KR")}</div>
          <div><span className="text-[#999999]">ACCOUNT</span> {account}</div>
        </div>
        <p>
          <strong className="text-[#111111]">지금 내 앞에 있는 PC</strong>의 화면에 위와 같은 코드가 보이나요?
          승인하면 그 PC가 내 계정으로 <strong className="text-[#111111]">한 번만</strong> 파일을 올릴 수 있어요.
          누군가 QR을 보여주며 스캔을 부탁했다면 승인하지 마세요. 그 사람이 올린 파일이 내 이름으로 저장돼요.
        </p>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-3">
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await approveTicket(code);
              if (result.ticketId) { setTicketId(result.ticketId); setStatus("approved"); }
              else setError(result.error ?? "승인하지 못했어요.");
            })}
            className={`${button} bg-[#111111] text-white border-[#111111]`}
          >
            [ 승인 ]
          </button>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await denyTicket(code); setStatus("cancelled"); })}
            className={`${button} border-[#DDDDDD] text-[#666666]`}
          >
            [ 거절 ]
          </button>
        </div>
      </div>
    );
  }

  const messages: Record<Exclude<Status, "pending">, string> = {
    approved: "승인했어요. PC에서 계정을 확인하고 파일을 올리면 여기에 코드가 나타나요.",
    uploading: "PC에서 업로드하고 있어요...",
    done: "업로드가 끝났어요. 내 파일 목록에서도 볼 수 있어요.",
    cancelled: "취소된 요청이에요.",
    expired: "만료된 요청이에요. PC에서 새 코드를 받아주세요.",
  };

  return (
    <div className="space-y-6">
      <p>{messages[status]}</p>
      {status === "done" && resultCode && (
        <div>
          <div className="font-mono text-[10px] text-[#999999] tracking-widest">DOWNLOAD CODE</div>
          <div className="font-mono text-4xl tracking-[0.2em] text-[#111111]">{resultCode}</div>
        </div>
      )}
      {(status === "approved" || status === "uploading") && ticketId && (
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await cancelMyTicket(ticketId); setStatus("cancelled"); })}
          className={`${button} border-red-200 text-red-500`}
        >
          [ 승인 취소 ]
        </button>
      )}
    </div>
  );
}
