import { getVerifiedUser } from "@/lib/session-check";
import { db } from "@/db";
import { users, files } from "@/db/schema";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, HardDrive, Users, FileText, Database, ShieldCheck, Lock } from "lucide-react";
import { isAdminEmail } from "@/lib/site";
import { getDiskStats } from "@/lib/storage";
import { adminDeleteBundle, adminSetBan } from "@/app/actions/admin";
import ConfirmButton from "@/components/ConfirmButton";

export default async function AdminPage() {
  const verified = await getVerifiedUser();

  if (!verified || !isAdminEmail(verified.user.email)) {
    redirect("/");
  }

  // Fetch all users and files
  const allUsers = await db.select().from(users);
  const allFiles = await db.select().from(files).orderBy(desc(files.createdAt));
  const disk = await getDiskStats().catch(() => null);

  // Compute metrics
  const totalUsers = allUsers.length;
  const totalFiles = allFiles.length;
  const totalSizeBytes = allFiles.reduce((acc, file) => acc + file.sizeBytes, 0);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  // Group files by uploader for user metrics
  const userStats = allUsers.map(u => {
    const userFiles = allFiles.filter(f => f.uploaderId === u.id);
    const usedBytes = userFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    return {
      ...u,
      fileCount: userFiles.length,
      usedBytes,
      usagePercent: Math.min(100, (usedBytes / u.quotaBytes!) * 100)
    };
  }).sort((a, b) => b.usedBytes - a.usedBytes); // Sort by highest usage

  // Group files into shared bundles (one download code each), newest first
  const emailById = new Map(allUsers.map(u => [u.id, u.email]));
  const bundles = [...allFiles.reduce((acc, f) => {
    const list = acc.get(f.downloadCode) ?? [];
    list.push(f);
    return acc.set(f.downloadCode, list);
  }, new Map<string, typeof allFiles>())].map(([code, list]) => ({
    code,
    files: list,
    uploader: emailById.get(list[0].uploaderId) ?? list[0].uploaderId,
    sizeBytes: list.reduce((acc, f) => acc + f.sizeBytes, 0),
    createdAt: list[0].createdAt,
    expiresAt: list[0].expiresAt,
    isEncrypted: list[0].isEncrypted,
  }));

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const formatDate = (d: Date | null) => d ? d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

  const thClass = "font-mono text-[9px] text-[#999999] uppercase tracking-widest pb-4 border-b-[0.5px] border-[#EEEEEE] font-normal";
  const dangerButton = "font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-md border-[0.5px] border-red-200 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50";

  return (
    <main className="min-h-screen bg-[#F5F7FA] text-[#111111] font-sans selection:bg-[#2549BB] selection:text-white p-6 md:p-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:40px_40px] opacity-30 z-0 pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10 flex flex-col gap-10">

        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5]">
          <div className="flex items-center gap-4">
            <Link href="/" className="w-10 h-10 rounded-full bg-[#F5F7FA] flex items-center justify-center text-[#666666] hover:bg-[#111111] hover:text-white transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex flex-col">
              <div className="font-mono text-[10px] text-[#2549BB] tracking-widest uppercase flex items-center gap-1.5 mb-1">
                <ShieldCheck size={12} /> HYPER_SEND Admin
              </div>
              <h1 className="text-2xl font-bold tracking-tight">System Dashboard</h1>
            </div>
          </div>
          <div className="hidden sm:block font-mono text-xs text-[#999999] bg-[#FAFAFA] px-4 py-2 rounded-lg border-[0.5px] border-[#EEEEEE]">
            {verified.user.email}
          </div>
        </header>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5] flex flex-col gap-2 relative overflow-hidden">
             <Users className="absolute -right-4 -bottom-4 text-[#FAFAFA] w-32 h-32" />
             <span className="font-mono text-[10px] text-[#999999] uppercase tracking-widest relative z-10">Total Users</span>
             <span className="text-4xl font-bold text-[#111111] relative z-10">{totalUsers}</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5] flex flex-col gap-2 relative overflow-hidden">
             <FileText className="absolute -right-4 -bottom-4 text-[#FAFAFA] w-32 h-32" />
             <span className="font-mono text-[10px] text-[#999999] uppercase tracking-widest relative z-10">Total Files</span>
             <span className="text-4xl font-bold text-[#111111] relative z-10">{totalFiles}</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5] flex flex-col gap-2 relative overflow-hidden">
             <Database className="absolute -right-4 -bottom-4 text-[#F0F4FF] w-32 h-32" />
             <span className="font-mono text-[10px] text-[#2549BB] uppercase tracking-widest relative z-10">Stored Files</span>
             <div className="flex items-baseline gap-1 relative z-10">
               <span className="text-4xl font-bold text-[#2549BB]">{totalSizeGB}</span>
               <span className="font-mono text-sm text-[#2549BB]">GB</span>
             </div>
          </div>
          <div className="bg-[#111111] p-6 rounded-2xl shadow-sm border-[0.5px] border-[#111111] flex flex-col gap-2 relative overflow-hidden">
             <HardDrive className="absolute -right-4 -bottom-4 text-[#222222] w-32 h-32" />
             <span className="font-mono text-[10px] text-[#888888] uppercase tracking-widest relative z-10">Disk Free</span>
             {disk ? (
               <div className="flex items-baseline gap-1 relative z-10">
                 <span className="text-4xl font-bold text-white">{formatGB(disk.freeBytes)}</span>
                 <span className="font-mono text-sm text-[#888888]">/ {formatGB(disk.totalBytes)} GB</span>
               </div>
             ) : (
               <span className="text-xl font-medium text-white relative z-10">N/A</span>
             )}
          </div>
        </div>

        {/* Shared bundles: take down reported content here */}
        <div className="bg-white rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5] overflow-hidden flex flex-col">
          <div className="p-6 border-b-[0.5px] border-[#EEEEEE] flex justify-between items-center bg-[#FAFAFA]">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#111111] font-bold">Shared Bundles</h2>
            <span className="font-mono text-[10px] text-[#999999]">{bundles.length}</span>
          </div>

          <div className="p-6 overflow-x-auto">
            {bundles.length === 0 ? (
              <div className="text-center font-mono text-[10px] text-[#999999] py-8">NO_BUNDLES</div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr>
                    <th className={`${thClass} pl-4`}>Code</th>
                    <th className={thClass}>Files</th>
                    <th className={thClass}>Uploader</th>
                    <th className={thClass}>Size</th>
                    <th className={thClass}>Created / Expires</th>
                    <th className={`${thClass} text-right pr-4`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map(b => (
                    <tr key={b.code} className="hover:bg-[#F9FAFB] transition-colors align-top">
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] pl-4">
                        <span className="font-mono text-sm tracking-widest">{b.code}</span>
                        {b.isEncrypted && <Lock size={10} className="inline ml-1.5 text-[#999999]" />}
                      </td>
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] pr-4">
                        <div className="flex flex-col gap-0.5 max-w-[260px]">
                          {b.files.map(f => (
                            <span key={f.id} className="font-mono text-[10px] text-[#111111] truncate" title={f.originalName}>
                              {f.originalName}
                              {f.maxDownloads ? <span className="text-[#999999]"> · DL {f.currentDownloads}/{f.maxDownloads}</span> : null}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] font-mono text-[10px] text-[#666666]">{b.uploader}</td>
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] font-mono text-[10px]">{formatMB(b.sizeBytes)} MB</td>
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] font-mono text-[10px] text-[#666666]">
                        {formatDate(b.createdAt)}<br />
                        <span className="text-[#999999]">→ {formatDate(b.expiresAt)}</span>
                      </td>
                      <td className="py-4 border-b-[0.5px] border-[#EEEEEE] text-right pr-4">
                        <ConfirmButton
                          action={adminDeleteBundle.bind(null, b.code)}
                          confirmMessage={`${b.code} 묶음의 파일 ${b.files.length}개를 삭제할까요? 되돌릴 수 없어요.`}
                          className={dangerButton}
                        >
                          Delete
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* User Usage Chart & Table */}
        <div className="bg-white rounded-2xl shadow-sm border-[0.5px] border-[#E5E5E5] overflow-hidden flex flex-col">
          <div className="p-6 border-b-[0.5px] border-[#EEEEEE] flex justify-between items-center bg-[#FAFAFA]">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#111111] font-bold">User Storage Allocation</h2>
          </div>

          <div className="p-6 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className={`${thClass} pl-4`}>User</th>
                  <th className={thClass}>Files</th>
                  <th className={`${thClass} w-1/3`}>Storage Usage (GB)</th>
                  <th className={`${thClass} text-right pr-4`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u) => (
                  <tr key={u.id} className="group hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-4 border-b-[0.5px] border-[#EEEEEE] pl-4">
                      <div className="flex items-center gap-3">
                        <img src={u.image || ""} alt="" className="w-8 h-8 rounded-full bg-[#EEEEEE]" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-[#111111]">
                            {u.name || "Unknown"}
                            {u.bannedAt && <span className="ml-2 font-mono text-[9px] tracking-widest text-white bg-red-500 px-1.5 py-0.5 rounded">BANNED</span>}
                          </span>
                          <span className="font-mono text-[10px] text-[#666666]">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 border-b-[0.5px] border-[#EEEEEE]">
                      <span className="font-mono text-sm bg-[#EEEEEE] px-2 py-1 rounded-md text-[#111111]">{u.fileCount}</span>
                    </td>
                    <td className="py-4 border-b-[0.5px] border-[#EEEEEE] pr-8">
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className={u.usagePercent > 80 ? "text-red-500 font-bold" : "text-[#2549BB]"}>{formatGB(u.usedBytes)} GB</span>
                          <span className="text-[#999999]">{formatGB(u.quotaBytes!)} GB</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${u.usagePercent > 80 ? "bg-red-500" : "bg-[#2549BB]"}`}
                            style={{ width: `${u.usagePercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 border-b-[0.5px] border-[#EEEEEE] text-right pr-4">
                      {u.id === verified.user.id ? (
                        <span className="font-mono text-[10px] text-[#999999]">YOU</span>
                      ) : u.bannedAt ? (
                        <ConfirmButton
                          action={adminSetBan.bind(null, u.id, false)}
                          confirmMessage={`${u.email} 차단을 해제할까요?`}
                          className="font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-md border-[0.5px] border-[#DDDDDD] text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors disabled:opacity-50"
                        >
                          Unban
                        </ConfirmButton>
                      ) : (
                        <ConfirmButton
                          action={adminSetBan.bind(null, u.id, true)}
                          confirmMessage={`${u.email}을(를) 차단할까요? 모든 기기에서 로그아웃되고, 올린 파일 ${u.fileCount}개가 모두 삭제돼요.`}
                          className={dangerButton}
                        >
                          Ban
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}
