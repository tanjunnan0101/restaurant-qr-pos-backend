import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import type {
  AdjustAttendanceSessionDto,
  ApproveAttendanceSessionDto,
  ClockAttendanceDto,
  ListAttendanceSessionsQueryDto,
  UpdateAttendanceSettingsDto,
} from './dto/attendance.dto';

const attendanceSettingSelect = {
  id: true,
  requirePhoto: true,
  allowManualClockIn: true,
  maxShiftHours: true,
  autoFlagLateClockOut: true,
  timezone: true,
  version: true,
  updatedAt: true,
};

const attendanceSessionInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  photos: {
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      type: true,
      photoUrl: true,
      capturedAt: true,
      createdAt: true,
    },
  },
  adjustments: {
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      reason: true,
      beforeJson: true,
      afterJson: true,
      createdAt: true,
      adjustedBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async getCurrent(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const [settings, currentSession, recentSessions] = await Promise.all([
      this.getOrCreateSettings(this.prisma, user.companyId, outletId, user.userId),
      attendanceSessions(this.prisma).findFirst({
        where: {
          companyId: user.companyId,
          outletId,
          userId: user.userId,
          status: 'CLOCKED_IN',
        },
        orderBy: { clockInAt: 'desc' },
        include: attendanceSessionInclude,
      }),
      attendanceSessions(this.prisma).findMany({
        where: {
          companyId: user.companyId,
          outletId,
          userId: user.userId,
        },
        orderBy: { clockInAt: 'desc' },
        take: 5,
        include: attendanceSessionInclude,
      }),
    ]);

    return {
      settings: this.toSettingResponse(settings),
      currentSession: currentSession
        ? this.toSessionResponse(currentSession)
        : null,
      recentSessions: (recentSessions as any[]).map((session) =>
        this.toSessionResponse(session),
      ),
    };
  }

  async clockIn(
    user: AuthenticatedUser,
    outletId: string,
    dto: ClockAttendanceDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const settings = await this.getOrCreateSettings(
        tx,
        user.companyId,
        outletId,
        user.userId,
      );
      if (!settings.allowManualClockIn) {
        throw new BadRequestException(
          'Manual clock-in is currently disabled for this outlet.',
        );
      }

      const existing = await attendanceSessions(tx).findFirst({
        where: {
          companyId: user.companyId,
          outletId,
          userId: user.userId,
          status: 'CLOCKED_IN',
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'You already have an active attendance session at this outlet.',
        );
      }

      const photoPayload = normalizePhotoPayload(dto.photoDataUrl);
      if (settings.requirePhoto && !photoPayload) {
        throw new BadRequestException(
          'Clock-in photo proof is required for this outlet.',
        );
      }

      const session = await attendanceSessions(tx).create({
        data: {
          companyId: user.companyId,
          outletId,
          userId: user.userId,
          status: 'CLOCKED_IN',
          approvalStatus: 'PENDING',
          clockInDeviceLabel: normalizeText(dto.deviceLabel),
          clockInIpAddress: normalizeIp(ipAddress),
          clockInNote: normalizeText(dto.note),
        },
        include: attendanceSessionInclude,
      });

      if (photoPayload) {
        await attendancePhotos(tx).create({
          data: {
            companyId: user.companyId,
            outletId,
            attendanceSessionId: session.id,
            type: 'CLOCK_IN',
            photoUrl: photoPayload,
            uploadedByUserId: user.userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_CLOCKED_IN',
          entityType: 'attendance_session',
          entityId: session.id,
          afterJson: {
            sessionId: session.id,
            clockInAt: session.clockInAt,
            deviceLabel: normalizeText(dto.deviceLabel),
            photoProvided: Boolean(photoPayload),
          } as Prisma.InputJsonValue,
          reason: normalizeText(dto.note) ?? 'Staff member clocked in.',
          requestId,
          ipAddress,
        },
      });

      const refreshed = await attendanceSessions(tx).findUniqueOrThrow({
        where: { id: session.id },
        include: attendanceSessionInclude,
      });

      return this.toSessionResponse(refreshed);
    });
  }

  async clockOut(
    user: AuthenticatedUser,
    outletId: string,
    dto: ClockAttendanceDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const settings = await this.getOrCreateSettings(
        tx,
        user.companyId,
        outletId,
        user.userId,
      );
      const session = await attendanceSessions(tx).findFirst({
        where: {
          companyId: user.companyId,
          outletId,
          userId: user.userId,
          status: 'CLOCKED_IN',
        },
        orderBy: { clockInAt: 'desc' },
        include: attendanceSessionInclude,
      });
      if (!session) {
        throw new NotFoundException(
          'No active attendance session was found for this user.',
        );
      }

      const photoPayload = normalizePhotoPayload(dto.photoDataUrl);
      if (settings.requirePhoto && !photoPayload) {
        throw new BadRequestException(
          'Clock-out photo proof is required for this outlet.',
        );
      }

      const clockOutAt = new Date();
      if (clockOutAt.getTime() <= session.clockInAt.getTime()) {
        throw new BadRequestException(
          'Clock-out time must be later than clock-in time.',
        );
      }

      const workedMinutes = diffMinutes(session.clockInAt, clockOutAt);
      const flagged =
        settings.autoFlagLateClockOut &&
        workedMinutes > settings.maxShiftHours * 60;

      await attendanceSessions(tx).update({
        where: { id: session.id },
        data: {
          status: 'CLOCKED_OUT',
          clockOutAt,
          workedMinutes,
          approvalStatus: flagged ? 'FLAGGED' : 'PENDING',
          reviewReason: flagged
            ? `Shift exceeded configured maximum of ${settings.maxShiftHours} hours.`
            : null,
          clockOutDeviceLabel: normalizeText(dto.deviceLabel),
          clockOutIpAddress: normalizeIp(ipAddress),
          clockOutNote: normalizeText(dto.note),
        },
      });

      if (photoPayload) {
        await attendancePhotos(tx).create({
          data: {
            companyId: user.companyId,
            outletId,
            attendanceSessionId: session.id,
            type: 'CLOCK_OUT',
            photoUrl: photoPayload,
            uploadedByUserId: user.userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_CLOCKED_OUT',
          entityType: 'attendance_session',
          entityId: session.id,
          beforeJson: {
            status: session.status,
            clockInAt: session.clockInAt,
          } as Prisma.InputJsonValue,
          afterJson: {
            status: 'CLOCKED_OUT',
            clockOutAt,
            workedMinutes,
            approvalStatus: flagged ? 'FLAGGED' : 'PENDING',
            photoProvided: Boolean(photoPayload),
          } as Prisma.InputJsonValue,
          reason: normalizeText(dto.note) ?? 'Staff member clocked out.',
          requestId,
          ipAddress,
        },
      });

      const refreshed = await attendanceSessions(tx).findUniqueOrThrow({
        where: { id: session.id },
        include: attendanceSessionInclude,
      });

      return this.toSessionResponse(refreshed);
    });
  }

  async listSessions(
    user: AuthenticatedUser,
    outletId: string,
    query: ListAttendanceSessionsQueryDto,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const sessions = await attendanceSessions(this.prisma).findMany({
      where: {
        companyId: user.companyId,
        outletId,
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.approvalStatus
          ? { approvalStatus: query.approvalStatus }
          : {}),
        ...(query.from || query.to
          ? {
              clockInAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { clockInAt: 'desc' },
      take: query.limit ?? 50,
      include: attendanceSessionInclude,
    });

    return {
      sessions: (sessions as any[]).map((session) =>
        this.toSessionResponse(session),
      ),
    };
  }

  async getSettings(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const settings = await this.getOrCreateSettings(
      this.prisma,
      user.companyId,
      outletId,
      user.userId,
    );
    return this.toSettingResponse(settings);
  }

  async updateSettings(
    user: AuthenticatedUser,
    outletId: string,
    dto: UpdateAttendanceSettingsDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getOrCreateSettings(
        tx,
        user.companyId,
        outletId,
        user.userId,
      );

      const updated = await attendanceSettings(tx).update({
        where: { outletId },
        data: {
          requirePhoto: dto.requirePhoto ?? undefined,
          allowManualClockIn: dto.allowManualClockIn ?? undefined,
          maxShiftHours: dto.maxShiftHours ?? undefined,
          autoFlagLateClockOut: dto.autoFlagLateClockOut ?? undefined,
          timezone: dto.timezone ?? undefined,
          updatedByUserId: user.userId,
          version: { increment: 1 },
        },
        select: attendanceSettingSelect,
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_SETTINGS_UPDATED',
          entityType: 'attendance_settings',
          entityId: updated.id,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });

      return this.toSettingResponse(updated);
    });
  }

  async approveSession(
    user: AuthenticatedUser,
    outletId: string,
    sessionId: string,
    dto: ApproveAttendanceSessionDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const session = await attendanceSessions(tx).findFirst({
        where: {
          id: sessionId,
          companyId: user.companyId,
          outletId,
        },
        include: attendanceSessionInclude,
      });
      if (!session) {
        throw new NotFoundException('Attendance session not found.');
      }
      if (session.status !== 'CLOCKED_OUT') {
        throw new BadRequestException(
          'Only clocked-out sessions can be approved.',
        );
      }

      await attendanceSessions(tx).update({
        where: { id: session.id },
        data: {
          approvalStatus: 'APPROVED',
          approvedByUserId: user.userId,
          approvedAt: new Date(),
          reviewReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_SESSION_APPROVED',
          entityType: 'attendance_session',
          entityId: session.id,
          beforeJson: {
            approvalStatus: session.approvalStatus,
            approvedByUserId: session.approvedBy?.id ?? null,
            approvedAt: session.approvedAt,
          } as Prisma.InputJsonValue,
          afterJson: {
            approvalStatus: 'APPROVED',
          } as Prisma.InputJsonValue,
          reason: normalizeText(dto.reason) ?? 'Attendance session approved.',
          requestId,
          ipAddress,
        },
      });

      const refreshed = await attendanceSessions(tx).findUniqueOrThrow({
        where: { id: session.id },
        include: attendanceSessionInclude,
      });

      return this.toSessionResponse(refreshed);
    });
  }

  async adjustSession(
    user: AuthenticatedUser,
    outletId: string,
    sessionId: string,
    dto: AdjustAttendanceSessionDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const session = await attendanceSessions(tx).findFirst({
        where: {
          id: sessionId,
          companyId: user.companyId,
          outletId,
        },
        include: attendanceSessionInclude,
      });
      if (!session) {
        throw new NotFoundException('Attendance session not found.');
      }

      const nextClockInAt = dto.clockInAt
        ? new Date(dto.clockInAt)
        : session.clockInAt;
      const nextClockOutAt =
        dto.clockOutAt === undefined
          ? session.clockOutAt
          : dto.clockOutAt
            ? new Date(dto.clockOutAt)
            : null;

      if (
        nextClockOutAt &&
        nextClockOutAt.getTime() <= nextClockInAt.getTime()
      ) {
        throw new BadRequestException(
          'Adjusted clock-out time must be later than clock-in time.',
        );
      }

      const workedMinutes = nextClockOutAt
        ? diffMinutes(nextClockInAt, nextClockOutAt)
        : null;
      const nextStatus = nextClockOutAt ? 'CLOCKED_OUT' : 'CLOCKED_IN';

      const updated = await attendanceSessions(tx).update({
        where: { id: session.id },
        data: {
          clockInAt: nextClockInAt,
          clockOutAt: nextClockOutAt,
          workedMinutes,
          status: nextStatus,
          approvalStatus: 'ADJUSTED',
          approvedByUserId: user.userId,
          approvedAt: new Date(),
          reviewReason: dto.reason,
          ...(dto.note !== undefined
            ? {
                ...(nextClockOutAt
                  ? { clockOutNote: normalizeText(dto.note) }
                  : { clockInNote: normalizeText(dto.note) }),
              }
            : {}),
        },
        include: attendanceSessionInclude,
      });

      await attendanceAdjustments(tx).create({
        data: {
          companyId: user.companyId,
          outletId,
          attendanceSessionId: session.id,
          adjustedByUserId: user.userId,
          reason: dto.reason,
          beforeJson: {
            clockInAt: session.clockInAt,
            clockOutAt: session.clockOutAt,
            workedMinutes: session.workedMinutes,
            status: session.status,
            approvalStatus: session.approvalStatus,
            reviewReason: session.reviewReason,
          } as Prisma.InputJsonValue,
          afterJson: {
            clockInAt: updated.clockInAt,
            clockOutAt: updated.clockOutAt,
            workedMinutes: updated.workedMinutes,
            status: updated.status,
            approvalStatus: updated.approvalStatus,
            reviewReason: updated.reviewReason,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_SESSION_ADJUSTED',
          entityType: 'attendance_session',
          entityId: session.id,
          beforeJson: {
            clockInAt: session.clockInAt,
            clockOutAt: session.clockOutAt,
            workedMinutes: session.workedMinutes,
            status: session.status,
            approvalStatus: session.approvalStatus,
          } as Prisma.InputJsonValue,
          afterJson: {
            clockInAt: updated.clockInAt,
            clockOutAt: updated.clockOutAt,
            workedMinutes: updated.workedMinutes,
            status: updated.status,
            approvalStatus: updated.approvalStatus,
          } as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });

      return this.toSessionResponse(updated);
    });
  }

  private async getOrCreateSettings(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    outletId: string,
    updatedByUserId?: string,
  ) {
    const outlet = await client.outlet.findFirst({
      where: {
        id: outletId,
        companyId,
      },
      select: {
        timezone: true,
      },
    });
    if (!outlet) {
      throw new NotFoundException('Outlet not found.');
    }

    return attendanceSettings(client).upsert({
      where: { outletId },
      update: {},
      create: {
        companyId,
        outletId,
        timezone: outlet.timezone,
        updatedByUserId,
      },
      select: attendanceSettingSelect,
    });
  }

  private toSettingResponse(setting: any) {
    return {
      id: setting.id,
      requirePhoto: setting.requirePhoto,
      allowManualClockIn: setting.allowManualClockIn,
      maxShiftHours: setting.maxShiftHours,
      autoFlagLateClockOut: setting.autoFlagLateClockOut,
      timezone: setting.timezone,
      version: setting.version,
      updatedAt: setting.updatedAt,
    };
  }

  private toSessionResponse(session: any) {
    return {
      id: session.id,
      status: session.status,
      approvalStatus: session.approvalStatus,
      clockInAt: session.clockInAt,
      clockOutAt: session.clockOutAt,
      workedMinutes: session.workedMinutes,
      clockInDeviceLabel: session.clockInDeviceLabel,
      clockOutDeviceLabel: session.clockOutDeviceLabel,
      clockInIpAddress: session.clockInIpAddress,
      clockOutIpAddress: session.clockOutIpAddress,
      clockInNote: session.clockInNote,
      clockOutNote: session.clockOutNote,
      reviewReason: session.reviewReason,
      approvedAt: session.approvedAt,
      user: session.user,
      approvedBy: session.approvedBy,
      photos: session.photos,
      adjustments: session.adjustments,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

function attendanceSettings(client: unknown) {
  return (client as { attendanceSetting: any }).attendanceSetting;
}

function attendanceSessions(client: unknown) {
  return (client as { attendanceSession: any }).attendanceSession;
}

function attendancePhotos(client: unknown) {
  return (client as { attendancePhoto: any }).attendancePhoto;
}

function attendanceAdjustments(client: unknown) {
  return (client as { attendanceAdjustment: any }).attendanceAdjustment;
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeIp(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function normalizePhotoPayload(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const isDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed);
  const isHostedUrl = /^https?:\/\/.+/.test(trimmed);
  if (!isDataUrl && !isHostedUrl) {
    throw new BadRequestException(
      'Attendance photo must be a valid image data URL or hosted image URL.',
    );
  }

  return trimmed;
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}
