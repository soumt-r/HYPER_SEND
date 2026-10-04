CREATE TABLE "upload_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"tokenHash" text NOT NULL,
	"pairCode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"userId" text,
	"approvedAt" timestamp,
	"device" text,
	"uploadId" text,
	"resultCode" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	CONSTRAINT "upload_ticket_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "viaPublicPc" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_ticket" ADD CONSTRAINT "upload_ticket_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_ticket_pairCode_idx" ON "upload_ticket" USING btree ("pairCode");