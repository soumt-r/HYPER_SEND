import { createHash, timingSafeEqual } from "crypto";
import { isLockedOut, recordFailure } from "@/lib/rate-limit";

// Encrypted bundles are unlocked with an auth token the browser derives from the
// password (lib/e2ee.ts). The server keeps only the token's SHA-256, so it can
// check a password without being able to decrypt anything, and since every
// guess has to come through here, wrong guesses are rate limited.

const TOKEN_BYTES = 32;
const SALT_BYTES = 16;
export const MAX_META_LENGTH = 4096;

export const LOCKOUT_SECONDS = 15 * 60;
const MAX_FAILURES_PER_IP = 10;
// Also per bundle, so guesses spread over many IPs still hit a limit
const MAX_FAILURES_PER_CODE = 30;

function decodeBase64(value: unknown, bytes: number): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const buf = Buffer.from(value, "base64");
  return buf.length === bytes ? buf : null;
}

export const isValidSalt = (salt: unknown) => decodeBase64(salt, SALT_BYTES) !== null;

export const isValidMeta = (meta: unknown) =>
  typeof meta === "string" && meta.length <= MAX_META_LENGTH && /^[A-Za-z0-9+/]+={0,2}$/.test(meta);

/** Hash to store for an auth token (base64); null if it's malformed. */
export function hashToken(token: unknown): string | null {
  const buf = decodeBase64(token, TOKEN_BYTES);
  return buf ? createHash("sha256").update(buf).digest("hex") : null;
}

function tokenMatches(token: unknown, storedHash: string) {
  const hash = hashToken(token);
  if (!hash || hash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

/**
 * Check an auth token against a bundle's stored hash, with lockouts per IP and
 * per download code. Returns null on success, or the response to send.
 */
export async function verifyBundleToken(token: unknown, storedHash: string, ip: string, code: string) {
  const ipKey = `unlock:${ip}`;
  const codeKey = `unlock-code:${code}`;
  if (await isLockedOut(ipKey, MAX_FAILURES_PER_IP) || await isLockedOut(codeKey, MAX_FAILURES_PER_CODE)) {
    return { error: "비밀번호를 너무 많이 틀렸어요. 15분 후 다시 시도해주세요.", status: 429 };
  }
  if (tokenMatches(token, storedHash)) return null;

  await recordFailure(ipKey, LOCKOUT_SECONDS);
  await recordFailure(codeKey, LOCKOUT_SECONDS);
  return { error: "비밀번호가 맞지 않아요.", status: 403 };
}
