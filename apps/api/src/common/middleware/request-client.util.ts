import type { Request } from 'express';

type RequestWithHeaderReader = Pick<Request, 'header' | 'ip' | 'socket'>;

export function resolveRequestClientIp(
  request: RequestWithHeaderReader,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const directHeader =
      request.header('cf-connecting-ip') ??
      request.header('x-real-ip') ??
      request.header('fly-client-ip');
    if (directHeader) {
      return directHeader.trim().toLowerCase();
    }

    const forwardedFor = request.header('x-forwarded-for');
    if (forwardedFor) {
      const clientHop = forwardedFor.split(',')[0]?.trim().toLowerCase();
      if (clientHop) {
        return clientHop;
      }
    }
  }

  return (
    request.ip ??
    request.socket.remoteAddress ??
    'unknown-client'
  ).toLowerCase();
}
