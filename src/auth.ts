import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db"
import { accounts, sessions, users, verificationTokens } from "./db/schema"
import { eq } from "drizzle-orm"

declare module "next-auth" {
  interface Session {
    /** Unix seconds of the sign-in this token descends from (kept across refreshes) */
    loginAt?: number
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          hd: "hanyang.ac.kr", // Force Google login to only allow this domain
        },
      },
    }),
  ],
  // JWT sessions: auth() decrypts the cookie instead of querying the DB on every
  // request (each upload chunk calls auth()). The adapter still stores users.
  // Tokens last 7 days and are renewed daily while in use; revocation is handled
  // by lib/session-check.ts.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on sign-in; the login time then stays fixed on refreshes
      if (user) token.loginAt = Math.floor(Date.now() / 1000);
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.loginAt = token.loginAt as number | undefined;
      return session;
    },
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true
      const email = profile?.email
      if (!email?.endsWith("@hanyang.ac.kr") || profile?.email_verified !== true) return false

      // Banned users can't sign back in
      const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { bannedAt: true },
      })
      return !existing?.bannedAt
    },
  },
  pages: {
    signIn: '/login', // We will create this page later
  }
})
