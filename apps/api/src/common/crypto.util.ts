/**
 * Field-level encryption for secret inventory codes — AES-256-GCM.
 * MUST stay format-compatible with apps/api/prisma/seeds/seed.ts#encryptCode:
 *   stored = base64( iv(12) | authTag(16) | ciphertext )
 * Key comes from CODE_ENCRYPTION_KEY (base64, 32 bytes). Never logged, never returned to clients.
 */
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const k = Buffer.from(process.env.CODE_ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('CODE_ENCRYPTION_KEY must be 32 bytes (base64)');
  return k;
}

export function encryptCode(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptCode(stored: string): string {
  const raw = Buffer.from(stored, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
