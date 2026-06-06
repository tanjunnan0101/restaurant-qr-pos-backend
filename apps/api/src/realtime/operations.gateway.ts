import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/operations',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OperationsGateway {
  @WebSocketServer()
  private readonly server!: Server;

  publishToOutlet(outletId: string, event: string, payload: unknown): void {
    this.server.to(`outlet:${outletId}`).emit(event, payload);
  }
}
