import { integer, pgTable, text, primaryKey, timestamp, boolean, bigint, index } from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  quotaBytes: bigint("quotaBytes", { mode: "number" }).default(5368709120), // 5GB default
  usedBytes: bigint("usedBytes", { mode: "number" }).default(0),
  // Session tokens from logins before this time are rejected (see lib/session-check.ts)
  sessionsValidAfter: timestamp("sessionsValidAfter", { mode: "date" }),
  // Set by an admin: blocks sign-in and every signed-in action
  bannedAt: timestamp("bannedAt", { mode: "date" }),
})

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
)

export const files = pgTable("file", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  uploaderId: text("uploaderId").notNull().references(() => users.id),
  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
  localPath: text("localPath").notNull(),
  downloadCode: text("downloadCode").notNull(),
  // Encrypted bundles: SHA-256 of the auth token derived from the password
  // (lib/e2ee.ts), the salt to derive it, and the file's encrypted real name/type
  passwordHash: text("passwordHash"),
  authSalt: text("authSalt"),
  encryptedMeta: text("encryptedMeta"),
  
  expiresAt: timestamp("expiresAt", { mode: "date" }), 
  maxDownloads: integer("maxDownloads"),
  currentDownloads: integer("currentDownloads").default(0),

  isEncrypted: boolean("isEncrypted").default(false),
  // Uploaded from a public PC through an upload ticket (lib/upload-ticket.ts)
  viaPublicPc: boolean("viaPublicPc").notNull().default(false),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (file) => [
  index("file_downloadCode_idx").on(file.downloadCode), // code lookup
  index("file_uploaderId_idx").on(file.uploaderId), // "my files" list
  index("file_expiresAt_idx").on(file.expiresAt), // expiry worker
])

export type TicketStatus = "pending" | "approved" | "uploading" | "done" | "cancelled"

// Lets a signed-out browser (a public PC) upload one bundle into an account,
// after the account's owner approves it from their own signed-in phone
export const uploadTickets = pgTable("upload_ticket", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // SHA-256 of the secret the PC holds in memory and sends with each request
  tokenHash: text("tokenHash").notNull().unique(),
  // 6 digits shown on the PC (also inside its QR code), entered on the phone
  pairCode: text("pairCode").notNull(),
  status: text("status").$type<TicketStatus>().notNull().default("pending"),
  // Set on approval
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  approvedAt: timestamp("approvedAt", { mode: "date" }),
  // Browser and OS of the PC (no IP), shown on the phone before approving
  device: text("device"),
  uploadId: text("uploadId"),
  resultCode: text("resultCode"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
}, (ticket) => [
  index("upload_ticket_pairCode_idx").on(ticket.pairCode),
])
