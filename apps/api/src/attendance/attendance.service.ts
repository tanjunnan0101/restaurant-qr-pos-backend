import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus, type Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import type {
  AdjustAttendanceSessionDto,
  ApproveAttendanceSessionDto,
  CancelAttendanceShiftDto,
  ClockAttendanceDto,
  CreateAttendanceShiftDto,
  ListAttendanceShiftsQueryDto,
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

const attendanceShiftInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  sessions: {
    orderBy: { clockInAt: 'desc' },
    take: 1,
    select: {
      id: true,
      status: true,
      approvalStatus: true,
      clockInAt: true,
      clockOutAt: true,
      workedMinutes: true,
    },
  },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async getCurrent(
    user: AuthenticatedUser,
    outletId: string,
    targetUserId?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const subject = await this.resolveAttendanceSubject(
      this.prisma,
      user.companyId,
      outletId,
      targetUserId ?? user.userId,
    );

    const scheduleWindow = getDefaultScheduleWindow();

    const [settings, currentSession, recentSessions, staffRoster, scheduledShifts] =
      await Promise.all([
        this.getOrCreateSettings(
          this.prisma,
          user.companyId,
          outletId,
          user.userId,
        ),
        attendanceSessions(this.prisma).findFirst({
          where: {
            companyId: user.companyId,
            outletId,
            userId: subject.id,
            status: 'CLOCKED_IN',
          },
          orderBy: { clockInAt: 'desc' },
          include: attendanceSessionInclude,
        }),
        attendanceSessions(this.prisma).findMany({
          where: {
            companyId: user.companyId,
            outletId,
            userId: subject.id,
          },
          orderBy: { clockInAt: 'desc' },
          take: 8,
          include: attendanceSessionInclude,
        }),
        this.listAttendanceRoster(this.prisma, user.companyId, outletId),
        this.listScheduledShifts(this.prisma, user.companyId, outletId, {
          from: scheduleWindow.from,
          to: scheduleWindow.to,
        }),
      ]);

    return {
      settings: this.toSettingResponse(settings),
      selectedUser: subject,
      staffRoster,
      scheduleWindow,
      scheduledShifts: (scheduledShifts as any[]).map((shift) =>
        this.toShiftResponse(shift),
      ),
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
      const subject = await this.resolveAttendanceSubject(
        tx,
        user.companyId,
        outletId,
        dto.userId ?? user.userId,
      );
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
          userId: subject.id,
          status: 'CLOCKED_IN',
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'You already have an active attendance session at this outlet.',
        );
      }

      const scheduledShift = dto.scheduledShiftId
        ? await this.resolveScheduledShift(
            tx,
            user.companyId,
            outletId,
            subject.id,
            dto.scheduledShiftId,
          )
        : null;

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
          userId: subject.id,
          scheduledShiftId: scheduledShift?.id ?? null,
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
            attendanceUserId: subject.id,
            attendanceUserName: subject.fullName,
            scheduledShiftId: scheduledShift?.id ?? null,
            clockInAt: session.clockInAt,
            deviceLabel: normalizeText(dto.deviceLabel),
            photoProvided: Boolean(photoPayload),
          } as Prisma.InputJsonValue,
          reason:
            normalizeText(dto.note) ??
            `${subject.fullName} clocked in from the staff station.`,
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
      const subject = await this.resolveAttendanceSubject(
        tx,
        user.companyId,
        outletId,
        dto.userId ?? user.userId,
      );
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
          userId: subject.id,
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

      if (session.scheduledShiftId) {
        await attendanceShifts(tx).update({
          where: { id: session.scheduledShiftId },
          data: {
            status: 'COMPLETED',
            updatedByUserId: user.userId,
          },
        });
      }

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
            attendanceUserId: subject.id,
            attendanceUserName: subject.fullName,
            clockOutAt,
            workedMinutes,
            approvalStatus: flagged ? 'FLAGGED' : 'PENDING',
            photoProvided: Boolean(photoPayload),
          } as Prisma.InputJsonValue,
          reason:
            normalizeText(dto.note) ??
            `${subject.fullName} clocked out from the staff station.`,
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

  async listSchedules(
    user: AuthenticatedUser,
    outletId: string,
    query: ListAttendanceShiftsQueryDto,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const window = {
      from: query.from ?? getDefaultScheduleWindow().from,
      to: query.to ?? getDefaultScheduleWindow().to,
    };
    const shifts = await this.listScheduledShifts(
      this.prisma,
      user.companyId,
      outletId,
      {
        from: window.from,
        to: window.to,
        userId: query.userId,
        status: query.status,
      },
    );

    return {
      window,
      shifts: (shifts as any[]).map((shift) => this.toShiftResponse(shift)),
    };
  }

  async createSchedule(
    user: AuthenticatedUser,
    outletId: string,
    dto: CreateAttendanceShiftDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const subject = await this.resolveAttendanceSubject(
        tx,
        user.companyId,
        outletId,
        dto.userId,
      );
      const startsAt = new Date(dto.startsAt);
      const endsAt = new Date(dto.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException('Shift start and end time are required.');
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new BadRequestException(
          'Shift end time must be later than the shift start time.',
        );
      }
      const overlap = await attendanceShifts(tx).findFirst({
        where: {
          companyId: user.companyId,
          outletId,
          userId: subject.id,
          status: {
            in: ['SCHEDULED', 'COMPLETED'],
          },
          startsAt: {
            lt: endsAt,
          },
          endsAt: {
            gt: startsAt,
          },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new BadRequestException(
          'This staff member already has a shift overlapping that time range.',
        );
      }

      const created = await attendanceShifts(tx).create({
        data: {
          companyId: user.companyId,
          outletId,
          userId: subject.id,
          title: dto.title.trim(),
          stationLabel: normalizeText(dto.stationLabel),
          note: normalizeText(dto.note),
          startsAt,
          endsAt,
          createdByUserId: user.userId,
          updatedByUserId: user.userId,
        },
        include: attendanceShiftInclude,
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_SHIFT_CREATED',
          entityType: 'attendance_shift',
          entityId: created.id,
          afterJson: {
            shiftId: created.id,
            attendanceUserId: subject.id,
            attendanceUserName: subject.fullName,
            startsAt,
            endsAt,
            title: created.title,
            stationLabel: created.stationLabel,
          } as Prisma.InputJsonValue,
          reason:
            normalizeText(dto.note) ??
            `Scheduled ${subject.fullName} for ${created.title}.`,
          requestId,
          ipAddress,
        },
      });

      return this.toShiftResponse(created);
    });
  }

  async cancelSchedule(
    user: AuthenticatedUser,
    outletId: string,
    shiftId: string,
    dto: CancelAttendanceShiftDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await attendanceShifts(tx).findFirst({
        where: {
          id: shiftId,
          companyId: user.companyId,
          outletId,
        },
        include: attendanceShiftInclude,
      });
      if (!existing) {
        throw new NotFoundException('Attendance shift not found.');
      }
      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('This shift is already cancelled.');
      }

      const updated = await attendanceShifts(tx).update({
        where: { id: existing.id },
        data: {
          status: 'CANCELLED',
          note: normalizeText(dto.reason) ?? existing.note,
          updatedByUserId: user.userId,
        },
        include: attendanceShiftInclude,
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ATTENDANCE_SHIFT_CANCELLED',
          entityType: 'attendance_shift',
          entityId: updated.id,
          beforeJson: {
            status: existing.status,
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
          } as Prisma.InputJsonValue,
          afterJson: {
            status: updated.status,
          } as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });

      return this.toShiftResponse(updated);
    });
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

  private async resolveAttendanceSubject(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    outletId: string,
    targetUserId: string,
  ) {
    const access = await client.userOutletAccess.findFirst({
      where: {
        companyId,
        outletId,
        userId: targetUserId,
        user: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        role: {
          select: {
            systemKey: true,
            name: true,
          },
        },
      },
    });

    if (!access) {
      throw new NotFoundException(
        'Selected staff member is not active for this outlet.',
      );
    }

    return {
      id: access.user.id,
      fullName: access.user.fullName,
      email: access.user.email,
      roleKey: access.role.systemKey,
      roleName: access.role.name,
    };
  }

  private async listAttendanceRoster(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    outletId: string,
  ) {
    const [accessRows, activeSessions] = await Promise.all([
      client.userOutletAccess.findMany({
        where: {
          companyId,
          outletId,
          user: {
            deletedAt: null,
            status: UserStatus.ACTIVE,
          },
        },
        orderBy: [{ user: { fullName: 'asc' } }],
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          role: {
            select: {
              systemKey: true,
              name: true,
            },
          },
        },
      }),
      attendanceSessions(client).findMany({
        where: {
          companyId,
          outletId,
          status: 'CLOCKED_IN',
        },
        select: {
          id: true,
          userId: true,
          clockInAt: true,
        },
      }) as Promise<Array<{ id: string; userId: string; clockInAt: Date }>>,
    ]);

    const activeSessionMap = new Map<string, { id: string; clockInAt: Date }>(
      activeSessions.map((session) => [
        session.userId,
        {
          id: session.id,
          clockInAt: session.clockInAt,
        },
      ]),
    );

    return accessRows.map((access) => {
      const activeSession = activeSessionMap.get(access.user.id);
      return {
        id: access.user.id,
        fullName: access.user.fullName,
        email: access.user.email,
        roleKey: access.role.systemKey,
        roleName: access.role.name,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              clockInAt: activeSession.clockInAt,
            }
          : null,
      };
    });
  }

  private async listScheduledShifts(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    outletId: string,
    input: {
      from: string;
      to: string;
      userId?: string;
      status?: string;
    },
  ) {
    const from = new Date(input.from);
    const to = new Date(input.to);
    return attendanceShifts(client).findMany({
      where: {
        companyId,
        outletId,
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.status ? { status: input.status as any } : {}),
        startsAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      include: attendanceShiftInclude,
    });
  }

  private async resolveScheduledShift(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    outletId: string,
    userId: string,
    shiftId: string,
  ) {
    const shift = await attendanceShifts(client).findFirst({
      where: {
        id: shiftId,
        companyId,
        outletId,
        userId,
      },
    });
    if (!shift) {
      throw new NotFoundException('Scheduled shift not found for this user.');
    }
    if (shift.status === 'CANCELLED') {
      throw new BadRequestException('This scheduled shift has been cancelled.');
    }
    return shift;
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
      scheduledShiftId: session.scheduledShiftId ?? null,
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

  private toShiftResponse(shift: any) {
    const latestSession = shift.sessions?.[0] ?? null;
    return {
      id: shift.id,
      status: shift.status,
      title: shift.title,
      stationLabel: shift.stationLabel,
      note: shift.note,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      user: shift.user,
      latestSession: latestSession
        ? {
            id: latestSession.id,
            status: latestSession.status,
            approvalStatus: latestSession.approvalStatus,
            clockInAt: latestSession.clockInAt,
            clockOutAt: latestSession.clockOutAt,
            workedMinutes: latestSession.workedMinutes,
          }
        : null,
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt,
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

function attendanceShifts(client: unknown) {
  return (client as { attendanceShift: any }).attendanceShift;
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

function getDefaultScheduleWindow() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  to.setHours(23, 59, 59, 999);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
