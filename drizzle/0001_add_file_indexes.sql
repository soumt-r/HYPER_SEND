CREATE INDEX "file_downloadCode_idx" ON "file" USING btree ("downloadCode");--> statement-breakpoint
CREATE INDEX "file_uploaderId_idx" ON "file" USING btree ("uploaderId");--> statement-breakpoint
CREATE INDEX "file_expiresAt_idx" ON "file" USING btree ("expiresAt");