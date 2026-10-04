import { getVerifiedUser } from "@/lib/session-check";
import { getContactEmail, isAdminEmail } from "@/lib/site";
import HeroClient from "@/components/HeroClient";
import { db } from "@/db";
import { files } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function Home() {
  // A revoked token renders the page as signed out
  const verified = await getVerifiedUser();
  const session = verified?.session ?? null;
  
  let userFiles: any[] = [];
  let usage = { usedBytes: 0, quotaBytes: 0 };
  const isAdmin = isAdminEmail(verified?.user.email);
  const contactEmail = getContactEmail();

  if (verified) {
    userFiles = await db.query.files.findMany({
      where: eq(files.uploaderId, verified.user.id),
      orderBy: [desc(files.createdAt)],
      // Only what the file list shows; localPath and passwordHash stay on the server
      columns: {
        id: true, originalName: true, sizeBytes: true, downloadCode: true, isEncrypted: true,
        expiresAt: true, maxDownloads: true, currentDownloads: true, createdAt: true, viaPublicPc: true,
      },
    });
    // Quota usage changes with every upload, so it comes from the DB rather than the session token
    usage = { usedBytes: verified.user.usedBytes ?? 0, quotaBytes: verified.user.quotaBytes ?? 0 };
  }
  
  return (
    <main className="min-h-screen bg-[#FCFCFC] dark:bg-[#111111] text-[#1A1A1A] dark:text-[#E0E0E0] font-sans selection:bg-[#1A1A1A] dark:selection:bg-[#E0E0E0] selection:text-[#FCFCFC] dark:selection:text-[#111111] flex flex-col relative overflow-hidden transition-colors duration-300">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:32px_32px] opacity-60 z-0 pointer-events-none"></div>
      
      <HeroClient session={session} initialFiles={userFiles} isAdmin={isAdmin} usage={usage} contactEmail={contactEmail} />
      
      {/* Footer */}
      <footer className="w-full p-8 md:px-12 z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mt-auto">
        <div className="flex flex-col items-start gap-4 max-w-xl">
          <p className="text-[10px] text-[#999999] leading-relaxed break-keep font-sans">
            HYPER_SEND는 한양대학교 ERICA 학생이 개인적으로 만들어 운영하는 서비스예요. 한양대학교의 공식 서비스가 아니며, 학교의 승인이나 지원을 받지 않았어요.
          </p>
        </div>
        <div className="flex flex-col md:items-end gap-2 font-mono text-[9px] text-[#999999] uppercase tracking-widest shrink-0">
          <div className="flex flex-col md:items-end gap-1">
            <span>© 2026 HYPER_SEND.</span>
            <span className="font-sans text-[8px] opacity-70 normal-case">한양대학교 ERICA 국제문화대학 일본학과 24학번 Soumt 드림</span>
          </div>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-[#1A1A1A] dark:hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-[#1A1A1A] dark:hover:text-white transition-colors">Terms of Service</a>
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="hover:text-[#1A1A1A] dark:hover:text-white transition-colors">Contact</a>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
