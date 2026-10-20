import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { expand, extract } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Push payload encryption (RFC 8291, Message Encryption for Web Push, with the `aes128gcm` content coding of
 * RFC 8188), as the gateway's payload format defines it. Instances encrypt to a device's keys; browsers decrypt
 * natively, the Android task decrypts here, and the iOS Notification Service Extension does the same in Swift.
 */

/** A device's key material for one push subscription. `privateKey` never leaves the device. */
export interface PushKeys {
  /** The P-256 private scalar (32 bytes), base64url. */
  privateKey: string;
  /** The uncompressed P-256 public key (65 bytes), base64url; given to the instance. */
  p256dh: string;
  /** The 16-byte auth secret, base64url; given to the instance. */
  auth: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes base64url (padding optional); also accepts standard base64. Throws on anything else. */
export function base64UrlDecode(text: string): Uint8Array {
  const clean = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('not base64url');
  const binary = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * A fresh key pair and auth secret for one subscription. `random(n)` must return `n` cryptographically
 * secure random bytes (`expo-crypto` on phones, `crypto.getRandomValues` elsewhere).
 */
export function generatePushKeys(random: (length: number) => Uint8Array): PushKeys {
  // 48 bytes of seed reduce to a uniformly distributed scalar (FIPS 186-5 A.2.1), never zero.
  const secret = p256.utils.randomSecretKey(random(48));
  const auth = random(16);
  if (auth.length !== 16) throw new Error('random() returned the wrong number of bytes');
  return {
    privateKey: base64UrlEncode(secret),
    p256dh: base64UrlEncode(p256.getPublicKey(secret, false)),
    auth: base64UrlEncode(auth),
  };
}

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function contentKeys(shared: Uint8Array, auth: Uint8Array, uaPublic: Uint8Array, asPublic: Uint8Array, salt: Uint8Array) {
  const ikm = expand(sha256, extract(sha256, shared, auth), concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const prk = extract(sha256, ikm, salt);
  return {
    cek: expand(sha256, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16),
    nonce: expand(sha256, prk, enc.encode('Content-Encoding: nonce\0'), 12),
  };
}

/** Why a body could not be opened with a key; `wrong_key` is the expected miss when a device tries several keys. */
export class PushDecryptError extends Error {
  constructor(
    readonly reason: 'malformed' | 'wrong_key',
    message: string,
  ) {
    super(message);
    this.name = 'PushDecryptError';
  }
}

/** Opens a single-record RFC 8291 body with the device's keys and returns the plaintext without padding. */
export function decryptPushBody(body: Uint8Array, keys: Pick<PushKeys, 'privateKey' | 'p256dh' | 'auth'>): Uint8Array {
  if (body.length < 21) throw new PushDecryptError('malformed', 'body is shorter than the header');
  const salt = body.subarray(0, 16);
  const rs = ((body[16]! << 24) | (body[17]! << 16) | (body[18]! << 8) | body[19]!) >>> 0;
  const idlen = body[20]!;
  if (body.length < 21 + idlen) throw new PushDecryptError('malformed', 'body is shorter than the key ID');
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  if (rs < 18 || ciphertext.length > rs) throw new PushDecryptError('malformed', 'body has more than one record');
  if (ciphertext.length < 17) throw new PushDecryptError('malformed', 'record is too short');

  let shared: Uint8Array;
  try {
    // The compressed shared point is 0x02/0x03 followed by the x coordinate, which is the ECDH secret.
    shared = p256.getSharedSecret(base64UrlDecode(keys.privateKey), asPublic, true).subarray(1);
  } catch {
    throw new PushDecryptError('malformed', 'key ID is not a P-256 public key');
  }
  const { cek, nonce } = contentKeys(shared, base64UrlDecode(keys.auth), base64UrlDecode(keys.p256dh), asPublic, salt);
  let record: Uint8Array;
  try {
    record = gcm(cek, nonce).decrypt(ciphertext);
  } catch {
    throw new PushDecryptError('wrong_key', 'the record does not decrypt with this key');
  }
  let end = record.length;
  while (end > 0 && record[end - 1] === 0) end--;
  if (end === 0 || record[end - 1] !== 0x02) throw new PushDecryptError('malformed', 'the record has no 0x02 delimiter');
  return record.slice(0, end - 1);
}

/**
 * Tries each key a device holds for a subscription (one per account on the instance) and returns the first
 * plaintext that opens, with the key that opened it. Null when none fits.
 */
export function decryptPushBodyWithAny<K extends Pick<PushKeys, 'privateKey' | 'p256dh' | 'auth'>>(
  body: Uint8Array,
  keys: readonly K[],
): { plaintext: Uint8Array; key: K } | null {
  for (const key of keys) {
    try {
      return { plaintext: decryptPushBody(body, key), key };
    } catch (e) {
      if (e instanceof PushDecryptError && e.reason === 'malformed') return null;
    }
  }
  return null;
}

/**
 * Encrypts like an instance does (a fresh sender key and salt, one record). The client never sends pushes;
 * this exists for tests and for checking a device's keys locally.
 */
export function encryptPushBody(
  plaintext: Uint8Array,
  device: Pick<PushKeys, 'p256dh' | 'auth'>,
  options: { senderPrivateKey: Uint8Array; salt: Uint8Array; padding?: number },
): Uint8Array {
  const uaPublic = base64UrlDecode(device.p256dh);
  const asPublic = p256.getPublicKey(options.senderPrivateKey, false);
  const shared = p256.getSharedSecret(options.senderPrivateKey, uaPublic, true).subarray(1);
  const { cek, nonce } = contentKeys(shared, base64UrlDecode(device.auth), uaPublic, asPublic, options.salt);
  const record = concat(plaintext, new Uint8Array([0x02]), new Uint8Array(options.padding ?? 0));
  const header = new Uint8Array(21);
  header.set(options.salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, gcm(cek, nonce).encrypt(record));
}
