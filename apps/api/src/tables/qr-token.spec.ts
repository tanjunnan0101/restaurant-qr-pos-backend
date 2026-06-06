import { describe, expect, it } from 'vitest';
import { createQrTokenMaterial, hashQrToken, verifyQrToken } from './qr-token';

describe('QR token security', () => {
  it('creates a verifiable token without returning it as the stored hash', () => {
    const material = createQrTokenMaterial();

    expect(material.publicCode).toHaveLength(16);
    expect(material.token).not.toEqual(material.tokenHash);
    expect(material.tokenHash).toEqual(hashQrToken(material.token));
    expect(verifyQrToken(material.token, material.tokenHash)).toBe(true);
  });

  it('rejects a different token', () => {
    const material = createQrTokenMaterial();

    expect(verifyQrToken('not-the-token', material.tokenHash)).toBe(false);
  });
});
