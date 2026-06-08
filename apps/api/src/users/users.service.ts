import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus, type Prisma } from '@restaurant-pos/db';
import { createActivationToken } from '../common/security/activation-token';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { RemoveStaffAccessDto } from './dto/remove-staff-access.dto';
import { ReissueStaffActivationDto } from './dto/reissue-staff-activation.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';

const assignableRoleKeys = ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly config: ConfigService,
  ) {}

  async listOutletStaff(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const accessRows = await this.prisma.userOutletAccess.findMany({
      where: {
        companyId: user.companyId,
        outletId,
        user: {
          deletedAt: null,
        },
      },
      orderBy: [{ user: { fullName: 'asc' } }, { createdAt: 'asc' }],
      include: {
        user: {
          include: {
            activationTokens: {
              where: { usedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    return {
      users: accessRows.map((access) => ({
        id: access.user.id,
        email: access.user.email,
        fullName: access.user.fullName,
        status: access.user.status,
        lastLoginAt: access.user.lastLoginAt,
        role: {
          id: access.role.id,
          systemKey: access.role.systemKey,
          name: access.role.name,
          permissions: access.role.rolePermissions.map(
            ({ permission }) => permission.key,
          ),
        },
        activation: {
          pending: access.user.status !== UserStatus.ACTIVE,
          expiresAt: access.user.activationTokens[0]?.expiresAt ?? null,
        },
      })),
    };
  }

  async listAssignableRoles(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const roles = await this.prisma.role.findMany({
      where: {
        companyId: user.companyId,
        systemKey: { in: [...assignableRoleKeys] },
      },
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return {
      roles: roles.map((role) => ({
        id: role.id,
        systemKey: role.systemKey,
        name: role.name,
        description: role.description,
        permissions: role.rolePermissions.map(({ permission }) => permission.key),
      })),
    };
  }

  async createStaffUser(
    actor: AuthenticatedUser,
    outletId: string,
    dto: CreateStaffUserDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(actor.companyId, outletId);
    const email = dto.email.toLowerCase();
    const activation = createActivationToken();
    const expiresAt = this.activationExpiry();
    const ownerBaseUrl = this.ownerBaseUrl();
    const companySlug = await this.companySlug(actor.companyId);

    const response = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: {
          companyId: actor.companyId,
          systemKey: dto.roleKey,
        },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
      if (!role) {
        throw new NotFoundException('Role not found.');
      }

      let targetUser = await tx.user.findUnique({
        where: {
          companyId_email: {
            companyId: actor.companyId,
            email,
          },
        },
      });

      if (!targetUser) {
        targetUser = await tx.user.create({
          data: {
            companyId: actor.companyId,
            email,
            fullName: dto.fullName,
            passwordHash: null,
            status: UserStatus.PENDING_ACTIVATION,
          },
        });
      }

      const existingAccess = await tx.userOutletAccess.findFirst({
        where: {
          companyId: actor.companyId,
          outletId,
          userId: targetUser.id,
        },
        include: {
          role: true,
        },
      });
      if (existingAccess) {
        throw new ConflictException(
          `${targetUser.fullName} already has ${existingAccess.role.name} access for this outlet.`,
        );
      }

      await tx.userOutletAccess.create({
        data: {
          companyId: actor.companyId,
          outletId,
          userId: targetUser.id,
          roleId: role.id,
        },
      });

      let activationPayload:
        | {
            token: string;
            expiresAt: Date;
            url: string;
          }
        | {
            token: null;
            expiresAt: null;
            url: null;
          };

      if (targetUser.status !== UserStatus.ACTIVE) {
        await tx.userActivationToken.updateMany({
          where: {
            userId: targetUser.id,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });
        await tx.userActivationToken.create({
          data: {
            userId: targetUser.id,
            tokenHash: activation.tokenHash,
            expiresAt,
          },
        });
        activationPayload = {
          token: activation.token,
          expiresAt,
          url: `${ownerBaseUrl}/activate?token=${encodeURIComponent(
            activation.token,
          )}&company=${encodeURIComponent(companySlug)}`,
        };
      } else {
        activationPayload = {
          token: null,
          expiresAt: null,
          url: null,
        };
      }

      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          outletId,
          actorUserId: actor.userId,
          actionType: 'STAFF_USER_ASSIGNED',
          entityType: 'user',
          entityId: targetUser.id,
          reason: `Staff access assigned as ${role.systemKey}.`,
          afterJson: {
            email: targetUser.email,
            fullName: targetUser.fullName,
            role: role.systemKey,
            activationUrl: activationPayload.url,
          } as Prisma.InputJsonValue,
          requestId,
          ipAddress,
        },
      });

      return {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.fullName,
        status: targetUser.status,
        role: {
          id: role.id,
          systemKey: role.systemKey,
          name: role.name,
          permissions: role.rolePermissions.map(({ permission }) => permission.key),
        },
        activation: activationPayload,
      };
    });

    return response;
  }

  async updateOutletRole(
    actor: AuthenticatedUser,
    outletId: string,
    userId: string,
    dto: UpdateStaffRoleDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(actor.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const access = await tx.userOutletAccess.findFirst({
        where: {
          companyId: actor.companyId,
          outletId,
          userId,
        },
        include: {
          user: true,
          role: true,
        },
      });
      if (!access) {
        throw new NotFoundException('Outlet staff member not found.');
      }

      const targetRole = await tx.role.findFirst({
        where: {
          companyId: actor.companyId,
          systemKey: dto.roleKey,
        },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
      if (!targetRole) {
        throw new NotFoundException('Target role not found.');
      }
      if (access.role.systemKey === targetRole.systemKey) {
        return {
          userId: access.userId,
          role: {
            id: targetRole.id,
            systemKey: targetRole.systemKey,
            name: targetRole.name,
            permissions: targetRole.rolePermissions.map(
              ({ permission }) => permission.key,
            ),
          },
        };
      }

      await tx.userOutletAccess.update({
        where: { id: access.id },
        data: { roleId: targetRole.id },
      });

      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          outletId,
          actorUserId: actor.userId,
          actionType: 'STAFF_ROLE_UPDATED',
          entityType: 'user_outlet_access',
          entityId: access.id,
          reason: dto.reason,
          beforeJson: {
            userId: access.userId,
            role: access.role.systemKey,
          } as Prisma.InputJsonValue,
          afterJson: {
            userId: access.userId,
            role: targetRole.systemKey,
          } as Prisma.InputJsonValue,
          requestId,
          ipAddress,
        },
      });

      return {
        userId: access.userId,
        role: {
          id: targetRole.id,
          systemKey: targetRole.systemKey,
          name: targetRole.name,
          permissions: targetRole.rolePermissions.map(
            ({ permission }) => permission.key,
          ),
        },
      };
    });
  }

  async reissueActivation(
    actor: AuthenticatedUser,
    outletId: string,
    userId: string,
    dto: ReissueStaffActivationDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(actor.companyId, outletId);
    const activation = createActivationToken();
    const expiresAt = this.activationExpiry();
    const ownerBaseUrl = this.ownerBaseUrl();
    const companySlug = await this.companySlug(actor.companyId);

    return this.prisma.$transaction(async (tx) => {
      const access = await tx.userOutletAccess.findFirst({
        where: {
          companyId: actor.companyId,
          outletId,
          userId,
        },
        include: {
          user: true,
        },
      });
      if (!access) {
        throw new NotFoundException('Outlet staff member not found.');
      }
      if (access.user.status === UserStatus.ACTIVE) {
        throw new BadRequestException(
          'This staff account is already active and does not need activation.',
        );
      }

      await tx.userActivationToken.updateMany({
        where: {
          userId,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });
      await tx.userActivationToken.create({
        data: {
          userId,
          tokenHash: activation.tokenHash,
          expiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          outletId,
          actorUserId: actor.userId,
          actionType: 'STAFF_ACTIVATION_REISSUED',
          entityType: 'user',
          entityId: userId,
          reason: dto.reason,
          afterJson: {
            expiresAt,
          } as Prisma.InputJsonValue,
          requestId,
          ipAddress,
        },
      });

      return {
        userId,
        activation: {
          token: activation.token,
          expiresAt,
          url: `${ownerBaseUrl}/activate?token=${encodeURIComponent(
            activation.token,
          )}&company=${encodeURIComponent(companySlug)}`,
        },
      };
    });
  }

  async removeOutletAccess(
    actor: AuthenticatedUser,
    outletId: string,
    userId: string,
    dto: RemoveStaffAccessDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(actor.companyId, outletId);

    if (actor.userId === userId) {
      throw new BadRequestException(
        'You cannot remove your own outlet access from the owner console.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const access = await tx.userOutletAccess.findFirst({
        where: {
          companyId: actor.companyId,
          outletId,
          userId,
        },
        include: {
          user: true,
          role: true,
        },
      });
      if (!access) {
        throw new NotFoundException('Outlet staff member not found.');
      }

      if (access.role.systemKey === 'OWNER') {
        const ownerCount = await tx.userOutletAccess.count({
          where: {
            companyId: actor.companyId,
            outletId,
            role: {
              systemKey: 'OWNER',
            },
          },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException(
            'This outlet must keep at least one owner access assignment.',
          );
        }
      }

      await tx.userOutletAccess.delete({
        where: {
          id: access.id,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          outletId,
          actorUserId: actor.userId,
          actionType: 'STAFF_ACCESS_REMOVED',
          entityType: 'user_outlet_access',
          entityId: access.id,
          reason: dto.reason,
          beforeJson: {
            userId: access.userId,
            email: access.user.email,
            fullName: access.user.fullName,
            role: access.role.systemKey,
          } as Prisma.InputJsonValue,
          afterJson: {
            removed: true,
          } as Prisma.InputJsonValue,
          requestId,
          ipAddress,
        },
      });

      return {
        userId: access.userId,
        removed: true,
      };
    });
  }

  private activationExpiry(): Date {
    return new Date(
      Date.now() +
        this.config.getOrThrow<number>('ONBOARDING_TOKEN_TTL_HOURS') *
          60 *
          60 *
          1000,
    );
  }

  private ownerBaseUrl() {
    return this.config.getOrThrow<string>('OWNER_APP_BASE_URL').replace(/\/$/, '');
  }

  private async companySlug(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company.slug;
  }
}
