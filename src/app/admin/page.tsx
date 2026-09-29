import { auth } from "@/auth";
import { db } from "@/db";
import { users, files } from "@/db/schema";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, HardDrive, Users, FileText, Database, ShieldCheck } from "lucide-react";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user || session.user.email !== process.env.ADMIN_EMAIL) {
    redirect("/");
  }

  // Fetch all users and files
  const allUsers = await db.select().from(users);
  const allFiles = await db.select().from(files).orderBy(desc(files.createdAt));

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

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

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
          <div className="font-mono text-xs text-[#999999] bg-[#FAFAFA] px-4 py-2 rounded-lg border-[0.5px] border-[#EEEEEE]">
            {session.user.email}
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
             <span className="font-mono text-[10px] text-[#2549BB] uppercase tracking-widest relative z-10">Global Storage</span>
             <div className="flex items-baseline gap-1 relative z-10">
               <span className="text-4xl font-bold text-[#2549BB]">{totalSizeGB}</span>
               <span className="font-mono text-sm text-[#2549BB]">GB</span>
             </div>
          </div>
          <div className="bg-[#111111] p-6 rounded-2xl shadow-sm border-[0.5px] border-[#111111] flex flex-col gap-2 relative overflow-hidden">
             <HardDrive className="absolute -right-4 -bottom-4 text-[#222222] w-32 h-32" />
             <span className="font-mono text-[10px] text-[#888888] uppercase tracking-widest relative z-10">Server Status</span>
             <div className="flex items-center gap-2 mt-2 relative z-10">
               <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
               <span className="text-xl font-medium text-white tracking-widest">ONLINE</span>
             </div>
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
                  <th className="font-mono text-[9px] text-[#999999] uppercase tracking-widest pb-4 border-b-[0.5px] border-[#EEEEEE] font-normal pl-4">User</th>
                  <th className="font-mono text-[9px] text-[#999999] uppercase tracking-widest pb-4 border-b-[0.5px] border-[#EEEEEE] font-normal">Files</th>
                  <th className="font-mono text-[9px] text-[#999999] uppercase tracking-widest pb-4 border-b-[0.5px] border-[#EEEEEE] font-normal w-1/3">Storage Usage (GB)</th>
                  <th className="font-mono text-[9px] text-[#999999] uppercase tracking-widest pb-4 border-b-[0.5px] border-[#EEEEEE] font-normal text-right pr-4">Joined At</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u, i) => (
                  <tr key={u.id} className="group hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-4 border-b-[0.5px] border-[#EEEEEE] pl-4">
                      <div className="flex items-center gap-3">
                        <img src={u.image || ""} alt="" className="w-8 h-8 rounded-full bg-[#EEEEEE]" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-[#111111]">{u.name || "Unknown"}</span>
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
                      <span className="font-mono text-[10px] text-[#999999]">
                        {/* drizzle mock date handling, assuming u.emailVerified might be used or just not shown */}
                        {u.id.substring(0,8)}...
                      </span>
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
