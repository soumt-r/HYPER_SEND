import { db } from "@/db";
import { files } from "@/db/schema";
import { lt } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { cleanupStaleSessions } from "@/lib/upload-session";
import { deleteFileRecords } from "@/lib/file-ops";

// Apply pending SQL migrations from ./drizzle, retrying while the DB is still starting up
async function runMigrations() {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      console.log("[Migrate] Database schema is up to date");
      return;
    } catch (err: any) {
      if (attempt >= 10) throw err;
      console.error(`[Migrate] Attempt ${attempt} failed (${err.message}), retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production") {
      await runMigrations();
    }

    // Anyone with AUTH_SECRET can mint a session for any user, so it must be long and random
    if ((process.env.AUTH_SECRET ?? "").length < 32) {
      console.warn("[Security] AUTH_SECRET is shorter than 32 characters. Generate one with `npx auth secret`.");
    }

    console.log("Starting Background Cleanup Worker...");
    
    // Run every 1 minute
    setInterval(async () => {
      // Remove temp files of chunked uploads that were abandoned
      await cleanupStaleSessions().catch((err) => console.error("[Worker] Upload cleanup error:", err));

      try {
        const now = new Date();
        
        // Find expired files
        const expiredFiles = await db.query.files.findMany({
          where: lt(files.expiresAt, now)
        });
        
        for (const file of expiredFiles) console.log(`[Worker] Deleting expired file: ${file.id}`);
        await deleteFileRecords(expiredFiles);
        
      } catch (err) {
        console.error("[Worker] Cleanup error:", err);
      }
    }, 60 * 1000);
  }
}
