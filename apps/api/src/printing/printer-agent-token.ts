import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createPrinterAgentToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPrinterAgentToken(token) };
}

export function hashPrinterAgentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyPrinterAgentToken(
  token: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashPrinterAgentToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
