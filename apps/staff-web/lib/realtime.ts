import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/$/, '');

export const outletOperationsEvents = [
  'order.created',
  'order.updated',
  'order.status.changed',
  'payment.started',
  'payment.confirmed',
  'kitchen.ticket.created',
  'table.status.changed',
  'menu.updated',
  'staff.updated',
  'printing.updated',
  'print.job.printed',
  'print.job.failed',
  'service.request.created',
  'service.request.resolved',
] as const;

function getOperationsBaseUrl() {
  return API_BASE_URL.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
}

export function createOperationsSocket(accessToken: string): Socket {
  return io(`${getOperationsBaseUrl()}/operations`, {
    transports: ['websocket'],
    autoConnect: true,
    withCredentials: true,
    auth: {
      token: accessToken,
    },
  });
}
