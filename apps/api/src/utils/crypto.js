import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
// Key derived from 64-char hex string → 32 bytes
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 *
 * GCM provides both confidentiality AND integrity (authenticated
 * encryption). Without the auth tag, a tampered ciphertext will fail to
 * decrypt, preventing chosen-ciphertext attacks.
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a ciphertext produced by encrypt().
 * Throws if the auth tag fails (data integrity violation).
 */
export function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

/** Returns true if the string looks like an encrypted value (contains 2 colons) */
export function isEncrypted(value) {
  return value.split(':').length === 3;
}

/** Safely decrypt — returns null if decryption fails instead of throwing */
export function safeDecrypt(value) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}
