"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, UploadCloud, Lock, Key, Clock, Hash, ShieldCheck, X, Download, Server } from "lucide-react";
import Image from "next/image";
import { useState, useTransition, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { loginWithGoogle, logout } from "@/app/actions/auth";
import { deleteFileAction } from "@/app/actions/manage";
import { createFileKey, decryptBlob, encryptRange, encryptedRangeSize } from "@/lib/e2ee";
import { MAX_DOWNLOAD_COUNT, MAX_EXPIRE_HOURS } from "@/lib/expiry";
import { QRCodeSVG } from "qrcode.react";

const OrbitSVG = () => (
  <svg viewBox="0 0 600 800" className="w-full h-full overflow-visible">
    <g transform="rotate(-15 300 450)">
      <path id="orbit1" d="M 50 450 A 250 80 0 0 0 550 450 A 250 80 0 0 0 50 450" stroke="#DDDDDD" strokeWidth="0.75" fill="none" />
      <g>
        <animateMotion dur="18s" repeatCount="indefinite"><mpath href="#orbit1" /></animateMotion>
        <path d="M 0 -6 Q 0 0 6 0 Q 0 0 0 6 Q 0 0 -6 0 Q 0 0 0 -6 Z" fill="#888888" />
      </g>
    </g>
    <g transform="rotate(10 300 420)">
      <path id="orbit2" d="M 100 420 A 200 60 0 0 1 500 420 A 200 60 0 0 1 100 420" stroke="#E5E5E5" strokeWidth="0.5" strokeDasharray="4 4" fill="none" />
      <g>
        <animateMotion dur="25s" repeatCount="indefinite"><mpath href="#orbit2" /></animateMotion>
        <path d="M 0 -4 Q 0 0 4 0 Q 0 0 0 4 Q 0 0 -4 0 Q 0 0 0 -4 Z" fill="#AAAAAA" />
      </g>
    </g>
  </svg>
);

const HyperLogoSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" className="w-7 h-7 drop-shadow-sm">
    <rect width="120" height="120" rx="28" fill="#F7F9FC"/>
    <path d="M51 13 Q51 8 57 10 L100 26 Q108 29 108 38 L108 68 Q108 75 101 72 L70 61 L70 43 Q70 37 64 35 L51 30 Z" fill="#315FF4" />
    <path d="M12 43 Q12 36 19 39 L62 55 Q70 58 70 66 L70 96 Q70 103 63 100 L20 84 Q12 81 12 73 Z" fill="#172B66" />
    <path d="M51 51 L70 58 V83 L51 76 Z" fill="#2549BB" />
  </svg>
);

const ShootingStars = () => {
  const stars = [
    { id: 1, top: "-10%", left: "30%", delay: 2, duration: 4 },
    { id: 2, top: "-10%", left: "70%", delay: 8, duration: 3.5 },
    { id: 3, top: "10%", left: "110%", delay: 15, duration: 4.5 },
    { id: 4, top: "-20%", left: "50%", delay: 22, duration: 3.8 },
  ];
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute w-[1px] h-[180px] bg-gradient-to-b from-transparent to-[#CCCCCC]"
          style={{ top: star.top, left: star.left, rotate: "45deg", transformOrigin: "top center" }}
          animate={{ y: [0, 1500], x: [0, -1500], opacity: [0, 1, 1, 0] }}
          transition={{ duration: star.duration, repeat: Infinity, delay: star.delay, ease: "linear" }}
        />
      ))}
    </div>
  );
};

// Must be a multiple of the 5MB E2EE block size
const UPLOAD_CHUNK_SIZE = 50 * 1024 * 1024;
// Files uploaded at the same time, to make better use of the connection
const PARALLEL_FILE_UPLOADS = 3;

type UploadPiece = { start: number; length: number; data: () => Promise<Blob> };
type UploadPlan = { name: string; type: string; size: number; pieces: UploadPiece[] };

// Split a file into upload pieces. Encrypted pieces are produced right before
// sending, so large files never have to be encrypted (or held) all at once.
async function planUpload(file: File, password: string): Promise<UploadPlan> {
  const pieces: UploadPiece[] = [];
  if (!password) {
    for (let start = 0; start < file.size; start += UPLOAD_CHUNK_SIZE) {
      const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
      pieces.push({ start, length: end - start, data: async () => file.slice(start, end) });
    }
    return { name: file.name, type: file.type, size: file.size, pieces };
  }

  const fileKey = await createFileKey(password);
  let uploadOffset = 0;
  let plainStart = 0;
  do {
    const start = plainStart;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const length = encryptedRangeSize(start, end);
    pieces.push({ start: uploadOffset, length, data: () => encryptRange(file, start, end, fileKey) });
    uploadOffset += length;
    plainStart = end;
  } while (plainStart < file.size);
  return { name: file.name, type: file.type || "application/octet-stream", size: uploadOffset, pieces };
}

// Send a file's pieces in order, retrying and resuming from what the server already has
async function uploadPieces(sessionId: string, index: number, plan: UploadPlan, onProgress: (bytes: number) => void) {
  let i = 0;
  let failures = 0;
  let lastError = "";
  while (i < plan.pieces.length) {
    const piece = plan.pieces[i];
    const res = await sendChunk(
      `/api/upload/${sessionId}/${index}?offset=${piece.start}&length=${piece.length}`,
      await piece.data(),
      (loaded) => onProgress(piece.start + loaded),
    ).catch((err: Error) => { lastError = err.message; return null; });

    if (res?.received !== undefined) {
      if (res.error) {
        failures++;
        lastError = res.error;
      } else {
        failures = 0;
      }
      // Continue from the server's position (also covers a lost response to a stored piece)
      const next = plan.pieces.findIndex(p => p.start === res.received);
      if (next === -1 && res.received !== plan.size) throw new Error("업로드 상태가 맞지 않습니다. 다시 시도해주세요.");
      i = next === -1 ? plan.pieces.length : next;
    } else if (res?.error) {
      throw new Error(res.error);
    } else {
      failures++;
    }
    if (failures >= 3) throw new Error(lastError || "업로드에 실패했습니다.");
  }
  onProgress(plan.size);
}

// Parse a JSON response, turning empty or non-JSON bodies (e.g. a proxy error page) into a readable error
async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `서버 오류가 발생했습니다. (HTTP ${res.status})` };
  }
}

// XHR instead of fetch for upload progress events
function sendChunk(url: string, chunk: Blob, onProgress: (loaded: number) => void) {
  return new Promise<{ received?: number; error?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)); }
      catch { reject(new Error(`서버 오류가 발생했습니다. (HTTP ${xhr.status})`)); }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류가 발생했습니다."));
    xhr.send(chunk);
  });
}

export default function HeroClient({ session, initialFiles = [], isAdmin = false, adminData = null }: { session: any, initialFiles?: any[], isAdmin?: boolean, adminData?: any }) {
  const [activeModal, setActiveModal] = useState<"NONE" | "DOWNLOAD" | "UPLOAD" | "MANAGE" | "ADMIN">("NONE");
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code && code.length === 8) {
        setDownloadCode(code);
        setActiveModal("DOWNLOAD");
      }
    }
  }, []);

  // Download State
  const [downloadCode, setDownloadCode] = useState("");
  const [isDownloadFocused, setIsDownloadFocused] = useState(false);
  const [foundFiles, setFoundFiles] = useState<any[]>([]);
  const [isBundleUnlocked, setIsBundleUnlocked] = useState(false);
  const [downloadPassword, setDownloadPassword] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  // Progress of the active (encrypted) download: percent received, then decrypting
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; decrypting: boolean } | null>(null);

  // Upload State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expireType, setExpireType] = useState<"COUNT" | "TIME">("COUNT");
  const [expireValue, setExpireValue] = useState("10");
  const [uploadPassword, setUploadPassword] = useState("");
  const [uploadState, setUploadState] = useState<"IDLE" | "ENCRYPTING" | "UPLOADING" | "SUCCESS" | "ERROR">("IDLE");
  const [uploadResult, setUploadResult] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState(0); // 0~100
  const fileInputRef = useRef<HTMLInputElement>(null);


  const [isPending, startTransition] = useTransition();

  const groupFilesByCode = (filesArray: any[]) => {
    return filesArray.reduce((acc, file) => {
      if (!acc[file.downloadCode]) acc[file.downloadCode] = [];
      acc[file.downloadCode].push(file);
      return acc;
    }, {} as Record<string, any[]>);
  };

  const myBundles = groupFilesByCode(initialFiles);
  const adminBundles = isAdmin && adminData ? groupFilesByCode(adminData.allFiles) : {};

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Copy the FileList now: resetting the input below empties it, and the
    // state updater may run later
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      setSelectedFiles(prev => [...prev, ...picked]);
      setUploadState("IDLE");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      const password = uploadPassword;
      setUploadState("UPLOADING");
      setUploadProgress(0);
      const plans = await Promise.all(selectedFiles.map(f => planUpload(f, password)));

      // 1. Start an upload session
      const init = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expireType,
          expireValue,
          isEncrypted: password.length > 0,
          files: plans.map(p => ({ name: p.name, type: p.type, size: p.size })),
        }),
      }).then(readJson);
      if (init.error) throw new Error(init.error);

      // 2. Send the files in 50MB pieces (Cloudflare rejects requests over 100MB),
      //    a few files at a time
      const totalBytes = plans.reduce((acc, p) => acc + p.size, 0) || 1;
      const sent = plans.map(() => 0);
      let nextFile = 0;
      let failed = false;
      const worker = async () => {
        while (!failed && nextFile < plans.length) {
          const i = nextFile++;
          try {
            await uploadPieces(init.id, i, plans[i], (bytes) => {
              sent[i] = bytes;
              setUploadProgress(Math.round((sent.reduce((a, b) => a + b, 0) / totalBytes) * 100));
            });
          } catch (err) {
            failed = true;
            throw err;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_FILE_UPLOADS, plans.length) }, worker));

      // 3. Finish: the server moves the files into place and issues the code
      const result = await fetch(`/api/upload/${init.id}/complete`, { method: "POST" }).then(readJson);
      if (result.error) throw new Error(result.error);

      setUploadProgress(100);
      setUploadState("SUCCESS");
      setUploadResult(result.code);
      setSelectedFiles([]);
      setUploadPassword("");
      router.refresh(); // reload the file list and quota
    } catch (err: any) {
      setUploadState("ERROR");
      setUploadResult(err.message || "An unexpected error occurred");
    }
  };

  const handleSearchCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (downloadCode.length !== 8) return;
    try {
      const res = await fetch(`/api/download-info/${downloadCode}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Files not found");
      setFoundFiles(data.files);
      setIsBundleUnlocked(false);
      setDownloadPassword("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDownloadSingleFile = async (file: any) => {
    // Unencrypted files: let the browser download natively, so it streams to disk
    // and shows its own progress instead of buffering the whole file in memory
    if (!file.isEncrypted) {
      const a = document.createElement("a");
      a.href = `/api/download/${file.id}`;
      a.download = file.originalName || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    // Check before fetching, so a missing password doesn't use up a download
    if (!downloadPassword) {
      alert("Password is required to decrypt this file.");
      return;
    }

    setActiveDownloadId(file.id);
    setDownloadProgress({ percent: 0, decrypting: false });
    try {
      const res = await fetch(`/api/download/${file.id}`);
      if (!res.ok || !res.body) {
        const err = await readJson(res);
        throw new Error(err.error || "Download failed");
      }

      // Read the body manually to report progress
      const total = Number(res.headers.get("Content-Length")) || file.sizeBytes || 0;
      const reader = res.body.getReader();
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        if (total) setDownloadProgress({ percent: Math.min(100, Math.round((loaded / total) * 100)), decrypting: false });
      }

      setDownloadProgress({ percent: 100, decrypting: true });
      let finalBlob: Blob;
      try {
        finalBlob = await decryptBlob(new Blob(parts), downloadPassword);
        finalBlob = new Blob([finalBlob], { type: res.headers.get("Content-Type") || "application/octet-stream" });
      } catch {
        throw new Error("Wrong Password or Decryption failed");
      }
      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking right away can cancel the save in some browsers
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      if (err.message.includes("Wrong Password") || err.message.includes("failed") || err.message.includes("decryption")) {
        setDownloadError("잘못된 비밀번호입니다. 다시 시도해주세요.");
        setIsBundleUnlocked(false);
        setDownloadPassword("");
      } else {
        alert(err.message);
      }
    } finally {
      setActiveDownloadId(null);
      setDownloadProgress(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (confirm("Are you sure you want to delete this file?")) {
      startTransition(async () => { await deleteFileAction(fileId); });
    }
  };

  const resetModal = () => {
    setActiveModal("NONE");
    setDownloadCode("");
    setFoundFiles([]);
    setSelectedFiles([]);
    setUploadState("IDLE");
    setUploadPassword("");
    setDownloadPassword("");
  };

  const formatBytes = (bytes = 0) => (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const usedGB = formatBytes(session?.user?.usedBytes);
  const quotaGB = formatBytes(session?.user?.quotaBytes);
  const usagePercent = session?.user?.quotaBytes ? Math.min(100, (session.user.usedBytes / session.user.quotaBytes) * 100) : 0;
  const isAnyFileEncryptedInModal = foundFiles.some(f => f.isEncrypted);

  return (
    <>
      <ShootingStars />
      <header className="w-full p-8 md:px-12 z-10 flex justify-between items-start">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <HyperLogoSVG />
            <span className="font-bold tracking-tighter text-xl dark:text-white">HYPER_SEND</span>
          </div>
          <span className="font-mono text-[9px] text-[#999999] tracking-widest uppercase">File Sharing Service</span>
        </div>
        <nav className="flex items-center gap-8">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="font-mono text-xs text-[#888888] hover:text-[#111111] dark:hover:text-white transition-colors uppercase"
            >
              [ {theme === 'dark' ? 'LIGHT' : 'DARK'} ]
            </button>
          )}
          {session?.user ? (
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] text-[#888888]">{session.user.email}</span>
              {isAdmin && (
                <a href="/admin" className="font-mono text-xs text-[#2549BB] hover:text-[#172B66] font-bold transition-colors">
                  [ Admin ]
                </a>
              )}
              <button
                onClick={() => startTransition(() => { logout() })}
                disabled={isPending}
                className="font-mono text-xs text-[#888888] hover:text-[#111111] dark:hover:text-white transition-colors"
              >
                [ Logout ]
              </button>
            </div>
          ) : (
            <button
              onClick={() => startTransition(() => { loginWithGoogle() })}
              disabled={isPending}
              className="font-mono text-xs text-[#888888] hover:text-[#111111] dark:hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isPending ? "Connecting..." : "[ Login ]"}
            </button>
          )}
        </nav>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 z-10 flex flex-col justify-center px-8 md:px-12 max-w-[1400px] w-full mx-auto relative">
        <div className="relative z-10 max-w-2xl">
          <div className="font-mono text-[10px] text-[#999999] mb-8 flex items-center gap-4 tracking-widest uppercase">
            <span className="w-12 h-[1px] bg-[#CCCCCC] dark:bg-[#444444]"></span>
            File Sharing Service
          </div>
          <h1 className="text-5xl md:text-[5.5rem] font-medium tracking-[-0.04em] leading-[1.05] text-[#111111] dark:text-white">
            Secure & <br />Lightning-fast.
          </h1>
          <p className="mt-10 text-[#666666] dark:text-[#AAAAAA] max-w-md leading-relaxed text-[15px] font-light">
            한양대학교 구성원을 위한 파일 전송 서비스.<br />
            업로드는 한양인만, 다운로드는 누구나.
          </p>

          <div className="mt-12 flex gap-4">
            {/* RECEIVE: dark bg = white, white text = dark */}
            <button
              onClick={() => setActiveModal("DOWNLOAD")}
              className="px-6 py-4 bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-mono text-[10px] tracking-widest hover:bg-[#333333] dark:hover:bg-[#DDDDDD] transition-colors"
            >
              [ RECEIVE_FILES ]
            </button>
            {session?.user && (
              <button
                onClick={() => setActiveModal("UPLOAD")}
                className="px-6 py-4 bg-white dark:bg-[#1A1A1A] border-[0.5px] border-[#111111] dark:border-[#555555] text-[#111111] dark:text-white font-mono text-[10px] tracking-widest hover:bg-[#FAFAFA] dark:hover:bg-[#222222] transition-colors"
              >
                [ SEND_FILES ]
              </button>
            )}
            {session?.user && (
              <button
                onClick={() => setActiveModal("MANAGE")}
                className="px-6 py-4 bg-transparent border-[0.5px] border-[#DDDDDD] dark:border-[#444444] text-[#999999] font-mono text-[10px] tracking-widest hover:border-[#111111] dark:hover:border-white hover:text-[#111111] dark:hover:text-white transition-colors"
              >
                [ MY_FILES ]
              </button>
            )}
          </div>
        </div>

        {/* Decorative Right Side */}
        <div className="absolute right-[5%] bottom-0 w-[45vw] max-w-[650px] h-[85vh] hidden lg:block pointer-events-none origin-bottom">
          <div className="absolute inset-x-4 bottom-0 top-[20%] border-t-[0.5px] border-x-[0.5px] border-[#EEEEEE] dark:border-[#333333] bg-gradient-to-t from-white dark:from-[#111111] to-transparent -z-10 transition-colors duration-300">
            <div className="absolute -top-1.5 -left-1.5 text-[#CCCCCC] dark:text-[#444444] font-mono text-xs">+</div>
            <div className="absolute -top-1.5 -right-1.5 text-[#CCCCCC] dark:text-[#444444] font-mono text-xs">+</div>
          </div>
          <div className="absolute inset-0 z-0 opacity-80"><OrbitSVG /></div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute inset-0 z-10"
          >
            <Image src="/illustration.png" alt="Mascot Illustration" fill className="object-contain object-bottom opacity-90 mix-blend-multiply dark:mix-blend-normal drop-shadow-sm" priority />
          </motion.div>
          <div className="absolute inset-0 z-20 opacity-80" style={{ clipPath: 'polygon(0 52%, 100% 52%, 100% 100%, 0 100%)' }}>
            <OrbitSVG />
          </div>

          {session?.user && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 1 }}
              className="absolute bottom-[15%] -left-[10%] bg-white dark:bg-[#1A1A1A] backdrop-blur-md border-[0.5px] border-[#E5E5E5] dark:border-[#333333] p-4 flex flex-col gap-2 z-30 shadow-[0_8px_30px_rgba(0,0,0,0.02)]"
            >
              <div className="text-[9px] font-mono text-[#999999] uppercase tracking-widest flex justify-between items-center w-36 mb-1">
                <span>Storage</span>
                <span className="text-[#111111] dark:text-white">{usagePercent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-[1px] bg-[#EEEEEE] dark:bg-[#333333] overflow-hidden">
                <div className="h-full bg-[#111111] dark:bg-white" style={{ width: `${usagePercent}%` }}></div>
              </div>
              <div className="text-[8px] font-mono text-[#BBBBBB] tracking-widest mt-1">
                {usedGB}GB / {quotaGB}GB
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* FULLSCREEN MODAL OVERLAY */}
      <AnimatePresence>
        {activeModal !== "NONE" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#FAFAFA]/90 dark:bg-[#111111]/90 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="bg-white dark:bg-[#1A1A1A] border-[0.5px] border-[#111111] dark:border-[#444444] w-full max-w-md shadow-2xl p-6 relative flex flex-col gap-6"
            >
              <button
                onClick={resetModal}
                className="absolute top-4 right-4 text-[#999999] hover:text-[#111111] dark:hover:text-white transition-colors"
              >
                <X size={20} strokeWidth={1} />
              </button>

              {/* DOWNLOAD MODAL */}
              {activeModal === "DOWNLOAD" && (
                <>
                  {foundFiles.length === 0 ? (
                    <div>
                      <div className="font-mono text-[10px] text-[#999999] mb-4 uppercase tracking-widest flex items-center gap-2">
                        <Download size={14} /> Download Files
                      </div>
                      <form
                        onSubmit={handleSearchCode}
                        className={`relative flex items-center border-b-[1.5px] ${isDownloadFocused ? 'border-[#111111] dark:border-white' : 'border-[#E0E0E0] dark:border-[#444444]'} transition-colors duration-300 pb-2`}
                      >
                        <span className="font-mono text-[#999999] mr-3">{">"}</span>
                        <input
                          type="text"
                          value={downloadCode}
                          onChange={(e) => setDownloadCode(e.target.value.toUpperCase())}
                          onFocus={() => setIsDownloadFocused(true)}
                          onBlur={() => setIsDownloadFocused(false)}
                          className="w-full bg-transparent font-mono text-2xl outline-none placeholder:text-[#E0E0E0] dark:placeholder:text-[#444444] tracking-[0.2em] text-[#111111] dark:text-white"
                          maxLength={8}
                          spellCheck={false}
                          autoFocus
                          placeholder="8-CHAR CODE"
                        />
                        <button
                          type="submit"
                          disabled={downloadCode.length !== 8}
                          className="text-[#999999] hover:text-[#111111] dark:hover:text-white transition-colors ml-4 focus:outline-none disabled:opacity-30 disabled:hover:text-[#999999]"
                        >
                          <ArrowRight size={22} strokeWidth={1.5} />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-mono text-[10px] text-[#999999] tracking-widest uppercase mb-1">BUNDLE_CODE</div>
                        <div className="font-mono text-2xl tracking-[0.2em] text-[#111111] dark:text-white">{downloadCode}</div>
                      </div>

                      {isAnyFileEncryptedInModal && !isBundleUnlocked ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); setIsBundleUnlocked(true); }}
                          className="relative bg-[#FAFAFA] dark:bg-[#111111] border-[0.5px] border-[#EEEEEE] dark:border-[#333333] p-5 flex flex-col gap-4"
                        >
                          <div className="font-mono text-[10px] text-[#111111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={14} className="text-[#2549BB]" /> Encrypted Bundle
                          </div>
                          <input
                            type="password"
                            autoFocus
                            placeholder="Enter decryption password"
                            value={downloadPassword}
                            onChange={(e) => { setDownloadPassword(e.target.value); setDownloadError(""); }}
                            className={`w-full bg-transparent border-b-[0.5px] ${downloadError ? 'border-red-500 text-red-500' : 'border-[#DDDDDD] dark:border-[#444444] text-[#111111] dark:text-white'} pb-2 font-mono text-xs outline-none focus:border-[#111111] dark:focus:border-white transition-colors`}
                          />
                          {downloadError && (
                            <span className="font-mono text-[9px] text-red-500 tracking-widest">{downloadError}</span>
                          )}
                          <button type="submit" disabled={!downloadPassword} className="w-full py-3 bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-mono text-[9px] tracking-widest uppercase hover:bg-transparent hover:text-[#111111] dark:hover:bg-transparent dark:hover:text-white border-[0.5px] border-[#111111] dark:border-white transition-colors disabled:opacity-50">
                            [ UNLOCK_FILES ]
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                          {foundFiles.map((file) => {
                            return (
                              <div key={file.id} className="relative overflow-hidden w-full border-[0.5px] border-[#E5E5E5] dark:border-[#333333] p-3 flex justify-between items-center group hover:border-[#111111] dark:hover:border-white transition-colors">
                                <div className="flex flex-col gap-1 overflow-hidden">
                                  <span className="font-mono text-xs text-[#111111] dark:text-white truncate max-w-[200px]" title={file.originalName}>
                                    {file.isEncrypted && <Lock size={10} className="inline mr-1 text-[#999999]" />}
                                    {file.originalName}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#999999] tracking-widest uppercase">
                                    {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
                                    {activeDownloadId === file.id && downloadProgress && (
                                      <span className="text-[#2549BB] dark:text-[#6F8FFF]">
                                        {downloadProgress.decrypting ? " · DECRYPTING" : ` · ${downloadProgress.percent}%`}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {activeDownloadId === file.id && downloadProgress && (
                                  <div className="absolute left-0 bottom-0 h-[2px] w-full bg-[#EEEEEE] dark:bg-[#2A2A2A]">
                                    <div
                                      className={`h-full bg-[#2549BB] dark:bg-[#6F8FFF] transition-[width] duration-200 ${downloadProgress.decrypting ? "animate-pulse" : ""}`}
                                      style={{ width: `${downloadProgress.percent}%` }}
                                    />
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleDownloadSingleFile(file)}
                                    disabled={activeDownloadId !== null}
                                    className="w-8 h-8 rounded-full border-[0.5px] border-[#DDDDDD] dark:border-[#444444] flex items-center justify-center text-[#999999] group-hover:border-[#111111] dark:group-hover:border-white group-hover:text-[#111111] dark:group-hover:text-white group-hover:bg-[#FAFAFA] dark:group-hover:bg-[#222222] transition-all disabled:opacity-50"
                                  >
                                    {activeDownloadId === file.id ? (
                                      <span className="animate-spin w-3 h-3 border-[1.5px] border-[#111111] dark:border-white border-t-transparent rounded-full" />
                                    ) : (
                                      <Download size={14} strokeWidth={1.5} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* UPLOAD MODAL */}
              {activeModal === "UPLOAD" && (
                <>
                  <div className="font-mono text-[10px] text-[#999999] tracking-widest uppercase flex items-center gap-2 border-b-[0.5px] border-[#EEEEEE] dark:border-[#333333] pb-4">
                    <UploadCloud size={14} /> Send Files
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />

                  {uploadState === "SUCCESS" ? (
                    <div className="w-full flex flex-col gap-4 mt-4">
                      <div className="w-full border-[0.5px] border-[#111111] dark:border-[#555555] bg-[#FAFAFA] dark:bg-[#111111] flex items-center justify-between p-6 relative overflow-hidden">
                        <div className="flex flex-col">
                          <div className="font-mono text-[10px] text-[#999999] tracking-widest uppercase mb-2">DOWNLOAD_CODE</div>
                          <div className="font-mono text-4xl tracking-[0.2em] font-medium text-[#111111] dark:text-white">{uploadResult}</div>
                        </div>
                        <div className="w-[80px] h-[80px] bg-white border-[0.5px] border-[#EEEEEE] p-2 flex items-center justify-center shrink-0">
                          <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/?code=${uploadResult}`} size={64} fgColor="#111111" />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/?code=${uploadResult}`;
                          navigator.clipboard.writeText(url);
                          alert("다운로드 링크가 복사되었습니다!");
                        }}
                        className="w-full py-4 bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-mono text-[10px] tracking-widest uppercase hover:bg-[#333333] dark:hover:bg-[#DDDDDD] transition-colors"
                      >
                        [ COPY_DIRECT_LINK ]
                      </button>
                    </div>
                  ) : selectedFiles.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-end mb-1">
                        <span className="font-mono text-[10px] text-[#111111] dark:text-white uppercase tracking-widest">{selectedFiles.length} FILES READY</span>
                        <div className="flex gap-3">
                          <button onClick={() => fileInputRef.current?.click()} className="font-mono text-[9px] text-[#2549BB] hover:text-[#172B66] uppercase transition-colors">[ ADD ]</button>
                          <button onClick={() => setSelectedFiles([])} className="font-mono text-[9px] text-[#999999] hover:text-red-500 uppercase transition-colors">[ CLEAR ]</button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-2 border-[0.5px] border-[#EEEEEE] dark:border-[#333333] p-2 bg-[#FAFAFA] dark:bg-[#111111]">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="flex justify-between items-center border-b-[0.5px] border-[#EEEEEE] dark:border-[#333333] last:border-0 pb-1 last:pb-0">
                            <div className="flex flex-col">
                              <span className="font-mono text-[10px] text-[#111111] dark:text-white truncate max-w-[200px]" title={f.name}>{f.name}</span>
                              <span className="font-mono text-[9px] text-[#999999]">{(f.size / 1024 / 1024).toFixed(2)}MB</span>
                            </div>
                            <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-[#999999] hover:text-red-500 transition-colors p-1">
                              <X size={12} strokeWidth={2} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-[100px] border-[0.5px] border-dashed border-[#CCCCCC] dark:border-[#555555] bg-[#FAFAFA] dark:bg-[#111111] flex flex-col items-center justify-center cursor-pointer hover:border-[#999999] dark:hover:border-[#888888] transition-colors group px-4"
                    >
                      <UploadCloud size={20} strokeWidth={1} className="text-[#999999] group-hover:text-[#111111] dark:group-hover:text-white transition-colors mb-2" />
                      <span className="font-mono text-[10px] text-[#999999] tracking-widest truncate w-full text-center">SELECT_FILES</span>
                    </div>
                  )}

                  {uploadState !== "SUCCESS" && (
                    <div className="flex flex-col gap-5 mt-2">
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <div className="font-mono text-[9px] text-[#999999] tracking-widest uppercase mb-1.5">Limit By</div>
                          <div className="flex border-[0.5px] border-[#DDDDDD] dark:border-[#444444] p-1 gap-1 bg-[#FAFAFA] dark:bg-[#111111]">
                            <button
                              onClick={() => setExpireType("COUNT")}
                              className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-widest transition-colors ${expireType === "COUNT" ? "bg-white dark:bg-[#2A2A2A] shadow-sm border-[0.5px] border-[#E5E5E5] dark:border-[#444444] text-[#111111] dark:text-white" : "text-[#999999] hover:text-[#111111] dark:hover:text-white"}`}
                            >
                              <Hash size={10} /> COUNT
                            </button>
                            <button
                              onClick={() => setExpireType("TIME")}
                              className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-widest transition-colors ${expireType === "TIME" ? "bg-white dark:bg-[#2A2A2A] shadow-sm border-[0.5px] border-[#E5E5E5] dark:border-[#444444] text-[#111111] dark:text-white" : "text-[#999999] hover:text-[#111111] dark:hover:text-white"}`}
                            >
                              <Clock size={10} /> TIME
                            </button>
                          </div>
                        </div>
                        <div className="w-[80px]">
                          <div className="font-mono text-[9px] text-[#999999] tracking-widest uppercase mb-1.5 text-center">
                            {expireType === "COUNT" ? "Max DL" : "Hours"}
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={expireType === "COUNT" ? MAX_DOWNLOAD_COUNT : MAX_EXPIRE_HOURS}
                            value={expireValue}
                            onChange={(e) => setExpireValue(e.target.value)}
                            className="w-full bg-transparent border-b-[0.5px] border-[#DDDDDD] dark:border-[#444444] pb-1 font-mono text-sm outline-none text-[#111111] dark:text-white text-center focus:border-[#111111] dark:focus:border-white transition-colors"
                          />
                        </div>
                      </div>

                      <div className="relative">
                        <div className="font-mono text-[9px] text-[#999999] uppercase tracking-widest flex items-center gap-1 mb-1.5">
                          <ShieldCheck size={10} /> E2EE Password (Optional)
                        </div>
                        <input
                          type="password"
                          placeholder="Leave blank for unencrypted"
                          value={uploadPassword}
                          onChange={(e) => setUploadPassword(e.target.value)}
                          className="w-full bg-transparent border-b-[0.5px] border-[#DDDDDD] dark:border-[#444444] pb-1 font-mono text-xs outline-none text-[#111111] dark:text-white focus:border-[#111111] dark:focus:border-white transition-colors placeholder:text-[#CCCCCC] dark:placeholder:text-[#555555]"
                        />
                      </div>

                      <button
                        onClick={handleUpload}
                        disabled={selectedFiles.length === 0 || uploadState === "UPLOADING" || uploadState === "ENCRYPTING"}
                        className="w-full mt-2 py-3 border-[0.5px] border-[#111111] dark:border-[#555555] bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-mono text-[10px] tracking-widest hover:bg-transparent hover:text-[#111111] dark:hover:bg-transparent dark:hover:text-white dark:hover:border-white transition-colors disabled:opacity-50 relative overflow-hidden"
                      >
                        {selectedFiles.length === 0
                          ? "[ SELECT_FILES_FIRST ]"
                          : uploadState === "ENCRYPTING"
                          ? `[ ENCRYPTING... ${uploadProgress}% ]`
                          : uploadState === "UPLOADING"
                          ? `[ UPLOADING... ${uploadProgress}% ]`
                          : "[ START_UPLOAD ]"}
                        {(uploadState === "UPLOADING" || uploadState === "ENCRYPTING") && (
                          <motion.div
                            className="absolute bottom-0 left-0 h-[2px] bg-white dark:bg-[#111111] opacity-70"
                            style={{ width: `${uploadProgress}%` }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                          />
                        )}
                      </button>

                      {uploadState === "ERROR" && (
                        <div className="font-mono text-[10px] text-red-500 text-center">{uploadResult}</div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* MANAGE MODAL */}
              {activeModal === "MANAGE" && (
                <>
                  <div className="font-mono text-[10px] text-[#999999] tracking-widest uppercase flex items-center gap-2 border-b-[0.5px] border-[#EEEEEE] dark:border-[#333333] pb-4">
                    <Server size={14} /> My Files
                  </div>
                  <div className="flex flex-col gap-4 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar">
                    {Object.keys(myBundles).length === 0 ? (
                      <div className="text-center font-mono text-[10px] text-[#999999] py-8">NO_FILES_UPLOADED</div>
                    ) : (
                      Object.entries(myBundles).map(([code, filesInBundle]: [string, any]) => (
                        <div key={code} className="w-full border-[0.5px] border-[#DDDDDD] dark:border-[#333333] bg-[#FAFAFA] dark:bg-[#111111] p-3 flex flex-col gap-2 relative group hover:border-[#111111] dark:hover:border-white transition-colors">
                          <div className="flex justify-between items-start mb-2 border-b-[0.5px] border-[#EEEEEE] dark:border-[#333333] pb-2">
                            <div className="font-mono text-sm text-[#111111] dark:text-white font-bold flex items-center gap-2">
                              {code}
                              <span className="text-[9px] text-[#999999] font-normal uppercase bg-[#EEEEEE] dark:bg-[#2A2A2A] px-1.5 py-0.5 rounded-sm">
                                {filesInBundle.length} Files
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                if (confirm("Delete this entire bundle?")) {
                                  filesInBundle.forEach((f: any) => startTransition(() => { deleteFileAction(f.id) }));
                                }
                              }}
                              className="font-mono text-[9px] text-[#999999] hover:text-red-500 transition-colors uppercase"
                            >
                              [ DEL_BUNDLE ]
                            </button>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {filesInBundle.map((file: any) => (
                              <div key={file.id} className="flex justify-between items-center pl-2 border-l-[1.5px] border-[#EEEEEE] dark:border-[#333333]">
                                <span className="font-mono text-[10px] text-[#666666] dark:text-[#AAAAAA] truncate w-2/3" title={file.originalName}>
                                  {file.isEncrypted && <Lock size={8} className="inline mr-1 text-[#999999]" />}
                                  {file.originalName}
                                </span>
                                <span className="font-mono text-[8px] text-[#999999] uppercase">
                                  {file.maxDownloads ? `DL: ${file.currentDownloads}/${file.maxDownloads}` : `TIME: ${new Date(file.expiresAt).toLocaleTimeString()}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
