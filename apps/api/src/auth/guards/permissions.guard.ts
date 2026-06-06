import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../../common/constants/metadata.constants';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      params: { outletId?: string };
    }>();
    const accesses = await this.prisma.userOutletAccess.findMany({
      where: {
        userId: request.user.userId,
        companyId: request.user.companyId,
        ...(request.params.outletId
          ? { outletId: request.params.outletId }
          : {}),
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: {
                permission: { select: { key: true } },
              },
            },
          },
        },
      },
    });

    const granted = new Set(
      accesses.flatMap((access) =>
        access.role.rolePermissions.map(({ permission }) => permission.key),
      ),
    );
    if (!required.every((permission) => granted.has(permission))) {
      throw new ForbiddenException(
        `Missing required permission: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
