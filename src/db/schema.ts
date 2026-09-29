import { integer, pgTable, text, primaryKey, timestamp, boolean, bigint } from "drizzle-orm/pg-core"
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
  passwordHash: text("passwordHash"),
  
  expiresAt: timestamp("expiresAt", { mode: "date" }), 
  maxDownloads: integer("maxDownloads"),
  currentDownloads: integer("currentDownloads").default(0),

  isEncrypted: boolean("isEncrypted").default(false),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
})
