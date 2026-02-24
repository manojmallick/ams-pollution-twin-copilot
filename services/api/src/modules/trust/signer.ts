import { createHash, sign, verify, generateKeyPairSync } from 'crypto';
import type { Signature } from '@ams-twin/contracts';

let privateKeyPem: string;
let publicKeyPem: string;
let publicKeyFingerprint: string;

function ensureKeys() {
  if (privateKeyPem) return;

  const envKey = process.env.SIGNING_PRIVATE_KEY;
  if (envKey) {
    privateKeyPem = envKey;
    publicKeyFingerprint = createHash('sha256').update(envKey).digest('hex').slice(0, 32);
    return;
  }

  // Dev: generate ephemeral Ed25519 key pair (changes on restart — fine for demo)
  const { privateKey: pk, publicKey: pubk } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  privateKeyPem = pk;
  publicKeyPem = pubk;
  publicKeyFingerprint = createHash('sha256').update(pubk).digest('hex').slice(0, 32);
  console.warn('[trust] Using ephemeral Ed25519 key — set SIGNING_PRIVATE_KEY env for persistence');
}

export function signPayload(canonicalJson: string): Signature {
  ensureKeys();

  const payloadSha256 = createHash('sha256').update(canonicalJson).digest('hex');

  // Ed25519 signing: pass null as digest algorithm (Ed25519 hashes internally)
  const signatureBuffer = sign(null, Buffer.from(canonicalJson), privateKeyPem);
  const signatureB64 = signatureBuffer.toString('base64');

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
    if (!publicKeyPem) return false;
    const sigBuffer = Buffer.from(signature.signatureB64, 'base64');
    return verify(null, Buffer.from(canonicalJson), publicKeyPem, sigBuffer);
  } catch {
    return false;
  }
}
