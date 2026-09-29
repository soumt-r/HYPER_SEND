import { db } from "@/db";
import { files, users } from "@/db/schema";
import { lt, sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { cleanupStaleSessions } from "@/lib/upload-session";

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
        
        for (const file of expiredFiles) {
          console.log(`[Worker] Deleting expired file: ${file.id}`);
          
          // Delete from disk
          try {
            const fs = await import("fs");
            fs.unlinkSync(file.localPath);
          } catch (e: any) {
            console.error(`[Worker] Could not delete physical file ${file.localPath}:`, e.message);
          }
          
          // Delete from DB
          await db.delete(files).where(eq(files.id, file.id));
          
          // Update user quota
          await db.update(users)
            .set({ usedBytes: sql`${users.usedBytes} - ${file.sizeBytes}` })
            .where(eq(users.id, file.uploaderId));
        }
        
      } catch (err) {
        console.error("[Worker] Cleanup error:", err);
      }
    }, 60 * 1000);
  }
}
