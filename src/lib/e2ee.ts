export async function deriveKey(password: string, salt: any) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Encrypted file format: salt(16) + for each 5MB plaintext block: iv(12) + ciphertext + tag(16)
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB original chunks
export const E2EE_BLOCK_SIZE = CHUNK_SIZE;
const SALT_BYTES = 16;
const BLOCK_OVERHEAD = 12 + 16;

/** Encrypted size of the piece covering plaintext bytes [start, end), as produced by encryptRange. */
export function encryptedRangeSize(start: number, end: number) {
  return (start === 0 ? SALT_BYTES : 0) + (end - start) + BLOCK_OVERHEAD * Math.ceil((end - start) / CHUNK_SIZE);
}

/** Per-file salt and key; encrypt the file piece by piece with encryptRange. */
export async function createFileKey(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { salt, key: await deriveKey(password, salt) };
}

/**
 * Encrypt plaintext bytes [start, end) of a file. `start` must be block-aligned.
 * The piece starting at 0 is prefixed with the salt, so concatenating all pieces
 * in order gives the same format as encrypting the whole file at once.
 */
export async function encryptRange(file: Blob, start: number, end: number, fileKey: { salt: Uint8Array<ArrayBuffer>; key: CryptoKey }) {
  const blobs: BlobPart[] = start === 0 ? [fileKey.salt] : [];
  for (let offset = start; offset < end; offset += CHUNK_SIZE) {
    const buffer = await file.slice(offset, Math.min(offset + CHUNK_SIZE, end)).arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, fileKey.key, buffer);
    blobs.push(iv, encrypted);
  }
  return new Blob(blobs);
}

export async function decryptBlob(blob: Blob, password: string): Promise<Blob> {
  if (blob.size < 16) throw new Error("Invalid encrypted file");
  
  const saltBuffer = await blob.slice(0, 16).arrayBuffer();
  const salt = new Uint8Array(saltBuffer);
  const key = await deriveKey(password, salt);
  
  const decryptedBlobs: Blob[] = [];
  let offset = 16;
  
  // An original chunk is up to CHUNK_SIZE.
  // Encrypted chunk size is up to CHUNK_SIZE + 16 (Auth Tag)
  // Plus 12 bytes IV prepended.
  const MAX_ENCRYPTED_BLOCK_SIZE = 12 + CHUNK_SIZE + 16;
  
  while (offset < blob.size) {
    const blockEnd = Math.min(offset + MAX_ENCRYPTED_BLOCK_SIZE, blob.size);
    const blockBuffer = await blob.slice(offset, blockEnd).arrayBuffer();
    
    if (blockBuffer.byteLength < 12) throw new Error("Invalid chunk size");
    
    const iv = new Uint8Array(blockBuffer.slice(0, 12));
    const encryptedData = blockBuffer.slice(12);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedData
    );
    
    decryptedBlobs.push(new Blob([decryptedBuffer]));
    offset = blockEnd;
  }
  
  return new Blob(decryptedBlobs, { type: blob.type });
}
