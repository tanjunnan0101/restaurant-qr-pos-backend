import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface QrTokenMaterial {
  publicCode: string;
  token: string;
  tokenHash: string;
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createQrTokenMaterial(): QrTokenMaterial {
  const token = randomBytes(32).toString('base64url');
  return {
    publicCode: randomBytes(12).toString('base64url'),
    token,
    tokenHash: hashQrToken(token),
  };
}

export function verifyQrToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashQrToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
