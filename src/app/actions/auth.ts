"use server";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function logout() {
  // Invalidate every token of this account, including copies on other devices
  const session = await auth();
  if (session?.user?.id) {
    await db.update(users).set({ sessionsValidAfter: new Date() }).where(eq(users.id, session.user.id));
  }
  await signOut({ redirectTo: "/" });
}
