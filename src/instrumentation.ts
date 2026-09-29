import { db } from "@/db";
import { files, users } from "@/db/schema";
import { lt, sql, eq } from "drizzle-orm";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Starting Background Cleanup Worker...");
    
    // Run every 1 minute
    setInterval(async () => {
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
