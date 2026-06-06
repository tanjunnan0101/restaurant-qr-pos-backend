import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnboardingStatus, UserStatus } from '@restaurant-pos/db';
import { compare, hash } from 'bcryptjs';
import { hashActivationToken } from '../common/security/activation-token';
import { PrismaService } from '../database/prisma.service';
import type { ActivateAccountDto } from './dto/activate-account.dto';
import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    user: {
      id: string;
      companyId: string;
      email: string;
      fullName: string;
      outlets: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
        permissions: string[];
      }>;
    };
  }> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        status: UserStatus.ACTIVE,
        deletedAt: null,
        company: {
          slug: dto.companySlug,
          status: 'ACTIVE',
        },
      },
      include: {
        outletAccess: {
          include: {
            outlet: true,
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (
      !user ||
      !user.passwordHash ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid company, email, or password.');
    }

    const expiresInSeconds = this.config.getOrThrow<number>(
      'JWT_EXPIRES_IN_SECONDS',
    );
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        companyId: user.companyId,
      },
      { expiresIn: expiresInSeconds },
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      expiresInSeconds,
      user: {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        fullName: user.fullName,
        outlets: user.outletAccess.map((access) => ({
          id: access.outlet.id,
          name: access.outlet.name,
          slug: access.outlet.slug,
          role: access.role.systemKey,
          permissions: access.role.rolePermissions.map(
            ({ permission }) => permission.key,
          ),
        })),
      },
    };
  }

  async activate(dto: ActivateAccountDto) {
    const now = new Date();
    const activation = await this.prisma.userActivationToken.findUnique({
      where: { tokenHash: hashActivationToken(dto.token) },
      include: {
        user: {
          include: {
            company: true,
          },
        },
      },
    });

    if (
      !activation ||
      activation.usedAt ||
      activation.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedException(
        'Activation link is invalid or has expired.',
      );
    }
    if (activation.user.status === UserStatus.ACTIVE) {
      throw new ConflictException('Account is already active.');
    }

    const passwordHash = await hash(dto.password, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: activation.userId },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
      await tx.userActivationToken.update({
        where: { id: activation.id },
        data: { usedAt: now },
      });
      await tx.clientOnboarding.updateMany({
        where: { ownerUserId: activation.userId },
        data: {
          ownerActivatedAt: now,
          status: OnboardingStatus.IN_PROGRESS,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: activation.user.companyId,
          actorUserId: activation.userId,
          actionType: 'OWNER_ACCOUNT_ACTIVATED',
          entityType: 'user',
          entityId: activation.userId,
          reason: 'Owner completed one-time account activation.',
        },
      });
    });

    return {
      activated: true,
      companySlug: activation.user.company.slug,
      email: activation.user.email,
    };
  }
}
