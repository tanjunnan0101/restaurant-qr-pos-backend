import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@restaurant-pos/db';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { PrismaService } from '../database/prisma.service';
import { OperationsGateway } from './operations.gateway';

function createGateway() {
  const jwt = {
    verifyAsync: vi.fn(),
  } as unknown as JwtService;
  const prisma = {
    user: {
      findFirst: vi.fn(),
    },
    userOutletAccess: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaService;

  return {
    gateway: new OperationsGateway(jwt, prisma),
    jwt,
    prisma,
  };
}

function createClient(input?: {
  authToken?: string;
  authorization?: string;
}): {
  handshake: {
    auth: Record<string, string>;
    headers: Record<string, string>;
  };
  data: {
    user?: AuthenticatedUser;
    outletIds?: string[];
  };
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
} {
  return {
    handshake: {
      auth: input?.authToken ? { token: input.authToken } : {},
      headers: input?.authorization
        ? { authorization: input.authorization }
        : {},
    },
    data: {},
    emit: vi.fn(),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };
}

describe('OperationsGateway', () => {
  it('authenticates a socket connection from handshake auth', async () => {
    const { gateway, jwt, prisma } = createGateway();
    const client = createClient({ authToken: 'token-123' });

    vi.mocked(jwt.verifyAsync).mockResolvedValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      email: 'staff@example.com',
      status: UserStatus.ACTIVE,
    } as never);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toEqual({
      userId: 'user-1',
      companyId: 'company-1',
      email: 'staff@example.com',
    });
  });

  it('disconnects an unauthenticated socket', async () => {
    const { gateway } = createGateway();
    const client = createClient();

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      message: 'Authentication required.',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins an authorized outlet room', async () => {
    const { gateway, prisma } = createGateway();
    const client = createClient();
    client.data.user = {
      userId: 'user-1',
      companyId: 'company-1',
      email: 'staff@example.com',
    };

    vi.mocked(prisma.userOutletAccess.findFirst).mockResolvedValue({
      id: 'access-1',
    } as never);

    const result = await gateway.subscribeOutlet(
      client as never,
      { outletId: 'outlet-1' },
    );

    expect(client.join).toHaveBeenCalledWith('outlet:outlet-1');
    expect(result).toEqual({ ok: true, outletId: 'outlet-1' });
  });
});
