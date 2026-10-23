import { createHmac } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/[\s=]/g, '').toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP code (SHA-1, 30 s, 6 digits) — the test-side "authenticator app". */
export function totpCode(secretBase32: string, nowMs = Date.now(), stepOffset = 0): string {
  const counter = Math.floor(nowMs / 30_000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest();
  const o = (h[h.length - 1] ?? 0) & 0x0f;
  const bin =
    (((h[o] ?? 0) & 0x7f) << 24) |
    ((h[o + 1] ?? 0) << 16) |
    ((h[o + 2] ?? 0) << 8) |
    (h[o + 3] ?? 0);
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * A code for a step not used yet: codes are single-use per 30 s step, so a second verification in
 * the same step must wait for the next one.
 */
export async function freshTotpCode(secretBase32: string, lastUsed?: string): Promise<string> {
  let code = totpCode(secretBase32);
  while (code === lastUsed) {
    await new Promise((r) => setTimeout(r, 1000));
    code = totpCode(secretBase32);
  }
  return code;
}
