import { createHash, randomBytes } from 'crypto';
import * as ed from '@noble/ed25519';
import type { Signature } from '@ams-twin/contracts';

// @noble/ed25519 v2 requires sha512Sync to be wired up.
// We use Node's built-in crypto so no extra package is needed.
ed.etc.sha512Sync = (...messages: Uint8Array[]) => {
  const hash = createHash('sha512');
  for (const m of messages) hash.update(m);
  return new Uint8Array(hash.digest());
};

let privateKeyBytes: Uint8Array;
let publicKeyBytes: Uint8Array;
let publicKeyFingerprint: string;

function generateEphemeral() {
  privateKeyBytes = randomBytes(32);
  publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  publicKeyFingerprint = createHash('sha256').update(publicKeyBytes).digest('hex').slice(0, 32);
  console.warn('[trust] Using ephemeral Ed25519 key — set SIGNING_PRIVATE_KEY env (64-char hex seed) for persistence');
}

function ensureKeys() {
  if (privateKeyBytes) return;

  const envKey = process.env.SIGNING_PRIVATE_KEY;
  if (envKey) {
    const stripped = envKey.replace(/\s+/g, '');

    // Support 64-char hex (32-byte seed) format only
    if (/^[0-9a-fA-F]{64}$/.test(stripped)) {
      privateKeyBytes = Buffer.from(stripped, 'hex');
      publicKeyBytes = ed.getPublicKey(privateKeyBytes);
      publicKeyFingerprint = createHash('sha256').update(publicKeyBytes).digest('hex').slice(0, 32);
      console.log('[trust] Loaded Ed25519 key from SIGNING_PRIVATE_KEY env');
      return;
    }

    // Legacy PEM or unknown format — warn and fall back to ephemeral
    console.warn('[trust] SIGNING_PRIVATE_KEY is not a 64-char hex seed — ignoring and using ephemeral key');
  }

  generateEphemeral();
}

export function signPayload(canonicalJson: string): Signature {
  ensureKeys();

  const payloadSha256 = createHash('sha256').update(canonicalJson).digest('hex');
  const msgBytes = Buffer.from(canonicalJson);

  // Pure-JS Ed25519 signing — no OpenSSL required
  const sigBytes = ed.sign(msgBytes, privateKeyBytes);
  const signatureB64 = Buffer.from(sigBytes).toString('base64');

  return {
    alg: 'Ed25519',
    payloadSha256,
    signatureB64,
    publicKeyFingerprint,
  };
}

export function verifySignature(canonicalJson: string, signature: Signature): boolean {
  try {
    ensureKeys();
    if (!publicKeyBytes) return false;
    const sigBytes = Buffer.from(signature.signatureB64, 'base64');
    const msgBytes = Buffer.from(canonicalJson);
    return ed.verify(sigBytes, msgBytes, publicKeyBytes);
  } catch {
    return false;
  }
}
