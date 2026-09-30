"use client";
import { useTransition } from "react";

// Runs a server action after a confirm() prompt
export default function ConfirmButton({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: () => Promise<unknown>;
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      className={className}
      onClick={() => {
        if (!confirm(confirmMessage)) return;
        startTransition(async () => {
          try {
            await action();
          } catch (err: any) {
            alert(err?.message || "실패했습니다.");
          }
        });
      }}
    >
      {isPending ? "..." : children}
    </button>
  );
}
