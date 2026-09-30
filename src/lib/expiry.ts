export const MAX_DOWNLOAD_COUNT = 100;
export const MAX_EXPIRE_HOURS = 24 * 7;

export type Expiry = { expiresAt: Date | null; maxDownloads: number | null };

/** Validate the upload form's expiry settings; returns null if they're out of range. */
export function parseExpiry(type: unknown, value: unknown): Expiry | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;

  if (type === "TIME") {
    if (n > MAX_EXPIRE_HOURS) return null;
    return { expiresAt: new Date(Date.now() + n * 60 * 60 * 1000), maxDownloads: null };
  }
  if (type === "COUNT") {
    if (n > MAX_DOWNLOAD_COUNT) return null;
    // Count-limited files are still removed after the maximum retention period,
    // so files nobody downloads don't stay on disk forever
    return { expiresAt: new Date(Date.now() + MAX_EXPIRE_HOURS * 60 * 60 * 1000), maxDownloads: n };
  }
  return null;
}
