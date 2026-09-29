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

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB original chunks

export async function encryptFile(file: File, password: string): Promise<File> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  
  const blobs: Blob[] = [new Blob([salt])];
  
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      buffer
    );
    
    blobs.push(new Blob([iv, encrypted]));
  }
  
  return new File(blobs, file.name, { type: file.type || 'application/octet-stream' });
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
