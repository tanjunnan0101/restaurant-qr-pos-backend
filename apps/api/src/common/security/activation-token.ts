import { createHash, randomBytes } from 'node:crypto';

export function createActivationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashActivationToken(token),
  };
}

export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
