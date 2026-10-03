// End-to-end encryption, done entirely in the browser.
//
// A bundle's password is stretched once (PBKDF2) into a master secret, and HKDF
// splits that into independent keys:
//   - auth token: proves the password to the server. The server stores only its
//     hash, so files, names and download counts stay locked without the password,
//     and guesses can only be tried online (rate limited), never offline.
//   - metadata key: encrypts each file's real name and type.
//   - file keys: one per file (from a per-file salt), for the file contents.
// None of these keys can be derived from another, so the server can't decrypt.

const enc = new TextEncoder();

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BLOCK_OVERHEAD = IV_BYTES + TAG_BYTES;
const PBKDF2_ITERATIONS = 600_000; // OWASP's recommendation for PBKDF2-SHA256

// Encrypted file format: salt(16) + for each 5MB plaintext block: iv(12) + ciphertext + tag(16)
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB original chunks
export const E2EE_BLOCK_SIZE = CHUNK_SIZE;

export type BundleKeys = {
  salt: Uint8Array<ArrayBuffer>;
  authToken: Uint8Array<ArrayBuffer>;
  metaKey: CryptoKey;
  master: CryptoKey;
};
export type FileKey = { salt: Uint8Array<ArrayBuffer>; key: CryptoKey };
export type FileMeta = { name: string; type: string; size: number };

const hkdf = (salt: Uint8Array<ArrayBuffer>, purpose: string) =>
  ({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode(`hyper-send ${purpose}`) });
const AES = { name: "AES-GCM", length: 256 };

async function deriveBundleKeys(password: string, salt: Uint8Array<ArrayBuffer>): Promise<BundleKeys> {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, 256);
  const master = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveBits", "deriveKey"]);
  const none = new Uint8Array(0);
  return {
    salt,
    master,
    authToken: new Uint8Array(await crypto.subtle.deriveBits(hkdf(none, "auth"), master, 256)),
    metaKey: await crypto.subtle.deriveKey(hkdf(none, "meta"), master, AES, false, ["encrypt", "decrypt"]),
  };
}

/** New random bundle salt and keys for an upload. */
export function createBundleKeys(password: string) {
  return deriveBundleKeys(password, crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Keys of an existing bundle, from the password and the bundle's salt (base64). */
export function unlockBundleKeys(password: string, saltBase64: string) {
  return deriveBundleKeys(password, fromBase64(saltBase64));
}

function fileKeyFromBundle(bundle: BundleKeys, salt: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.deriveKey(hkdf(salt, "file"), bundle.master, AES, false, ["encrypt", "decrypt"]);
}

/** Per-file salt and key; encrypt the file piece by piece with encryptRange. */
export async function createFileKey(bundle: BundleKeys): Promise<FileKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { salt, key: await fileKeyFromBundle(bundle, salt) };
}

// Each block's position and whether it's the last one are authenticated, so
// blocks can't be reordered, dropped or cut off at the end without detection
function blockAad(index: number, isLast: boolean) {
  const aad = new Uint8Array(9);
  new DataView(aad.buffer).setBigUint64(0, BigInt(index));
  aad[8] = isLast ? 1 : 0;
  return aad;
}

function blockCount(start: number, end: number) {
  // An empty file still gets one (empty) block, so its end is authenticated too
  return end === start ? 1 : Math.ceil((end - start) / CHUNK_SIZE);
}

/** Encrypted size of the piece covering plaintext bytes [start, end), as produced by encryptRange. */
export function encryptedRangeSize(start: number, end: number) {
  return (start === 0 ? SALT_BYTES : 0) + (end - start) + BLOCK_OVERHEAD * blockCount(start, end);
}

/**
 * Encrypt plaintext bytes [start, end) of a file. `start` must be block-aligned.
 * The piece starting at 0 is prefixed with the salt, so concatenating all pieces
 * in order gives the same format as encrypting the whole file at once.
 */
export async function encryptRange(file: Blob, start: number, end: number, fileKey: FileKey) {
  const blobs: BlobPart[] = start === 0 ? [fileKey.salt] : [];
  const blocks = blockCount(start, end);
  for (let b = 0; b < blocks; b++) {
    const offset = start + b * CHUNK_SIZE;
    const blockEnd = Math.min(offset + CHUNK_SIZE, end);
    const buffer = await file.slice(offset, blockEnd).arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const additionalData = blockAad(offset / CHUNK_SIZE, blockEnd >= file.size);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, fileKey.key, buffer);
    blobs.push(iv, encrypted);
  }
  return new Blob(blobs);
}

/** Decrypt a whole file of a bundle; throws if it was modified, reordered or truncated. */
export async function decryptFile(blob: Blob, bundle: BundleKeys): Promise<Blob> {
  if (blob.size < SALT_BYTES + BLOCK_OVERHEAD) throw new Error("Invalid encrypted file");
  const salt = new Uint8Array(await blob.slice(0, SALT_BYTES).arrayBuffer());
  const key = await fileKeyFromBundle(bundle, salt);

  const parts: Blob[] = [];
  for (let offset = SALT_BYTES, index = 0; offset < blob.size; index++) {
    const blockEnd = Math.min(offset + BLOCK_OVERHEAD + CHUNK_SIZE, blob.size);
    const block = await blob.slice(offset, blockEnd).arrayBuffer();
    if (block.byteLength < BLOCK_OVERHEAD) throw new Error("Invalid chunk size");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: block.slice(0, IV_BYTES), additionalData: blockAad(index, blockEnd === blob.size) },
      key,
      block.slice(IV_BYTES),
    );
    parts.push(new Blob([plain]));
    offset = blockEnd;
  }
  return new Blob(parts);
}

/** Encrypt a file's real name, type and size (base64, stored by the server as-is). */
export async function encryptMeta(bundle: BundleKeys, meta: FileMeta) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, bundle.metaKey, enc.encode(JSON.stringify(meta)));
  return toBase64(new Uint8Array(await new Blob([iv, data]).arrayBuffer()));
}

export async function decryptMeta(bundle: BundleKeys, encrypted: string): Promise<FileMeta> {
  const bytes = fromBase64(encrypted);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) }, bundle.metaKey, bytes.slice(IV_BYTES));
  const meta = JSON.parse(new TextDecoder().decode(data));
  return { name: String(meta.name), type: String(meta.type ?? ""), size: Number(meta.size) };
}

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Legacy format (bundles uploaded before the auth token existed): a PBKDF2 key
// per file from the password, no block positions, and plaintext names.

async function deriveLegacyKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    AES,
    false,
    ["decrypt"]
  );
}

export async function decryptLegacyBlob(blob: Blob, password: string): Promise<Blob> {
  if (blob.size < SALT_BYTES) throw new Error("Invalid encrypted file");
  const salt = new Uint8Array(await blob.slice(0, SALT_BYTES).arrayBuffer());
  const key = await deriveLegacyKey(password, salt);

  const decryptedBlobs: Blob[] = [];
  let offset = SALT_BYTES;
  while (offset < blob.size) {
    const blockEnd = Math.min(offset + BLOCK_OVERHEAD + CHUNK_SIZE, blob.size);
    const blockBuffer = await blob.slice(offset, blockEnd).arrayBuffer();
    if (blockBuffer.byteLength < IV_BYTES) throw new Error("Invalid chunk size");
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blockBuffer.slice(0, IV_BYTES) },
      key,
      blockBuffer.slice(IV_BYTES)
    );
    decryptedBlobs.push(new Blob([decryptedBuffer]));
    offset = blockEnd;
  }
  return new Blob(decryptedBlobs, { type: blob.type });
}
