import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@restaurant-pos/db';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Socket, Server } from 'socket.io';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';

interface JwtPayload {
  sub: string;
  companyId: string;
}

interface OutletSubscriptionInput {
  outletId: string;
}

type OperationsSocket = Socket & {
  data: {
    user?: AuthenticatedUser;
    outletIds?: string[];
  };
};

@Injectable()
@WebSocketGateway({
  namespace: '/operations',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OperationsGateway implements OnGatewayConnection {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  private readonly server!: Server;

  async handleConnection(client: OperationsSocket): Promise<void> {
    try {
      const token = this.extractBearerToken(client);
      if (!token) {
        throw new UnauthorizedException('Authentication required.');
      }

      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          companyId: payload.companyId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          companyId: true,
          email: true,
        },
      });
      if (!user) {
        throw new UnauthorizedException('User is no longer active.');
      }

      client.data.user = {
        userId: user.id,
        companyId: user.companyId,
        email: user.email,
      };
      client.data.outletIds = [];
      client.emit('operations.connected', {
        userId: user.id,
        companyId: user.companyId,
      });
    } catch (error) {
      client.emit('realtime.error', {
        message:
          error instanceof Error ? error.message : 'Authentication failed.',
      });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe.outlet')
  async subscribeOutlet(
    @ConnectedSocket() client: OperationsSocket,
    @MessageBody() body: OutletSubscriptionInput,
  ) {
    const user = client.data.user;
    if (!user) {
      return { ok: false, message: 'Authentication required.' };
    }
    if (!body?.outletId) {
      return { ok: false, message: 'outletId is required.' };
    }

    const access = await this.prisma.userOutletAccess.findFirst({
      where: {
        companyId: user.companyId,
        userId: user.userId,
        outletId: body.outletId,
      },
      select: { id: true },
    });
    if (!access) {
      return { ok: false, message: 'Outlet access denied.' };
    }

    await client.join(`outlet:${body.outletId}`);
    client.data.outletIds = Array.from(
      new Set([...(client.data.outletIds ?? []), body.outletId]),
    );
    return { ok: true, outletId: body.outletId };
  }

  @SubscribeMessage('unsubscribe.outlet')
  async unsubscribeOutlet(
    @ConnectedSocket() client: OperationsSocket,
    @MessageBody() body: OutletSubscriptionInput,
  ) {
    if (!body?.outletId) {
      return { ok: false, message: 'outletId is required.' };
    }

    await client.leave(`outlet:${body.outletId}`);
    client.data.outletIds = (client.data.outletIds ?? []).filter(
      (outletId: string) => outletId !== body.outletId,
    );
    return { ok: true, outletId: body.outletId };
  }

  publishToOutlet(outletId: string, event: string, payload: unknown): void {
    this.server.to(`outlet:${outletId}`).emit(event, payload);
  }

  private extractBearerToken(client: OperationsSocket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && /^Bearer\s+/i.test(authorization)) {
      return authorization.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }
}
