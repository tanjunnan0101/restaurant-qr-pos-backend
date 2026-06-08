import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrinterConnectionType,
  PrinterHealthStatus,
  PrintAttemptStatus,
  PrintJobStatus,
  PrintTemplate,
  type Prisma,
} from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { OperationsGateway } from '../realtime/operations.gateway';
import { TenantService } from '../tenant/tenant.service';
import type { SetupPrintersDto } from './dto/printer-setup.dto';
import { createPrinterAgentToken } from './printer-agent-token';
import type { AuthenticatedPrinterAgent } from './types/authenticated-printer-agent';

const agentConnectionTypes = [
  PrinterConnectionType.ESC_POS_LAN,
  PrinterConnectionType.ESC_POS_USB_BRIDGE,
  PrinterConnectionType.BLUETOOTH_BRIDGE,
];

@Injectable()
export class PrintingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly operations: OperationsGateway,
  ) {}

  async list(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const [stations, printers, agents, failedJobs] = await Promise.all([
      this.prisma.kitchenStation.findMany({
        where: { companyId: user.companyId, outletId },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
          printerRoute: {
            include: {
              primaryPrinter: true,
              backupPrinter: true,
            },
          },
        },
      }),
      this.prisma.printer.findMany({
        where: { companyId: user.companyId, outletId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.printerAgent.findMany({
        where: { companyId: user.companyId, outletId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          deviceId: true,
          name: true,
          active: true,
          appVersion: true,
          lastIpAddress: true,
          lastHeartbeatAt: true,
          createdAt: true,
        },
      }),
      this.prisma.printJob.findMany({
        where: {
          companyId: user.companyId,
          outletId,
          status: { in: [PrintJobStatus.FAILED, PrintJobStatus.RETRYING] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { printer: true },
      }),
    ]);
    return { stations, printers, agents, failedJobs };
  }

  async setup(
    user: AuthenticatedUser,
    outletId: string,
    dto: SetupPrintersDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    this.validateSetup(dto);

    let agentKey: string | null = null;
    let agentId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const stationIds = new Map<string, string>();
      for (const stationDto of dto.stations) {
        const station = await tx.kitchenStation.upsert({
          where: {
            outletId_key: { outletId, key: stationDto.key },
          },
          update: {
            name: stationDto.name,
            displayOrder: stationDto.displayOrder,
            active: stationDto.active,
          },
          create: {
            companyId: user.companyId,
            outletId,
            key: stationDto.key,
            name: stationDto.name,
            displayOrder: stationDto.displayOrder,
            active: stationDto.active,
          },
        });
        stationIds.set(station.key, station.id);
      }

      const printerIds = new Map<string, string>();
      for (const printerDto of dto.printers) {
        const printer = await tx.printer.upsert({
          where: {
            outletId_key: { outletId, key: printerDto.key },
          },
          update: {
            name: printerDto.name,
            connectionType: printerDto.connectionType,
            role: printerDto.role,
            host: printerDto.host,
            port: printerDto.port,
            paperWidthMm: printerDto.paperWidthMm,
            autoCut: printerDto.autoCut,
            buzzer: printerDto.buzzer,
            cashDrawer: printerDto.cashDrawer,
            active: printerDto.active,
          },
          create: {
            companyId: user.companyId,
            outletId,
            key: printerDto.key,
            name: printerDto.name,
            connectionType: printerDto.connectionType,
            role: printerDto.role,
            host: printerDto.host,
            port: printerDto.port,
            paperWidthMm: printerDto.paperWidthMm,
            autoCut: printerDto.autoCut,
            buzzer: printerDto.buzzer,
            cashDrawer: printerDto.cashDrawer,
            active: printerDto.active,
          },
        });
        printerIds.set(printer.key, printer.id);
      }

      for (const routeDto of dto.routes) {
        const stationId = stationIds.get(routeDto.stationKey);
        const primaryPrinterId = printerIds.get(routeDto.primaryPrinterKey);
        const backupPrinterId = routeDto.backupPrinterKey
          ? printerIds.get(routeDto.backupPrinterKey)
          : undefined;
        if (!stationId || !primaryPrinterId) {
          throw new BadRequestException(
            `Printer route ${routeDto.stationKey} references an unknown station or printer.`,
          );
        }
        if (routeDto.backupPrinterKey && !backupPrinterId) {
          throw new BadRequestException(
            `Backup printer ${routeDto.backupPrinterKey} was not provided.`,
          );
        }
        await tx.printerRoute.upsert({
          where: { stationId },
          update: { primaryPrinterId, backupPrinterId },
          create: {
            companyId: user.companyId,
            outletId,
            stationId,
            primaryPrinterId,
            backupPrinterId,
          },
        });
      }

      if (dto.agent) {
        const existing = await tx.printerAgent.findUnique({
          where: { deviceId: dto.agent.deviceId },
        });
        if (existing && existing.outletId !== outletId) {
          throw new ConflictException(
            'This printer-agent device ID belongs to another outlet.',
          );
        }
        if (!existing || dto.agent.rotateKey) {
          const material = createPrinterAgentToken();
          const agent = existing
            ? await tx.printerAgent.update({
                where: { id: existing.id },
                data: {
                  name: dto.agent.name,
                  tokenHash: material.tokenHash,
                  active: true,
                },
              })
            : await tx.printerAgent.create({
                data: {
                  companyId: user.companyId,
                  outletId,
                  deviceId: dto.agent.deviceId,
                  name: dto.agent.name,
                  tokenHash: material.tokenHash,
                },
              });
          agentKey = material.token;
          agentId = agent.id;
        } else {
          await tx.printerAgent.update({
            where: { id: existing.id },
            data: { name: dto.agent.name, active: true },
          });
          agentId = existing.id;
        }
      }

      await tx.clientOnboarding.updateMany({
        where: {
          companyId: user.companyId,
          printerConfiguredAt: null,
        },
        data: { printerConfiguredAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PRINTERS_CONFIGURED',
          entityType: 'outlet',
          entityId: outletId,
          afterJson: {
            stations: dto.stations.length,
            printers: dto.printers.length,
            routes: dto.routes.length,
            agentId,
            agentKeyRotated: Boolean(agentKey),
          },
          reason: 'Printer stations, routes, and local agent configured.',
          requestId,
          ipAddress,
        },
      });
    });

    const response = {
      configuration: await this.list(user, outletId),
      agent:
        agentId === null
          ? null
          : {
              id: agentId,
              key: agentKey,
              note: agentKey
                ? 'Store this key now. Only its hash is retained.'
                : 'Existing key retained. Set rotateKey to receive a new key.',
            },
    };
    this.operations.publishToOutlet(outletId, 'printing.updated', {
      outletId,
      action: 'configured',
    });
    return response;
  }

  async createTestPrint(
    user: AuthenticatedUser,
    outletId: string,
    printerId: string,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const printer = await this.prisma.printer.findFirst({
      where: {
        id: printerId,
        companyId: user.companyId,
        outletId,
        active: true,
      },
      include: { outlet: true },
    });
    if (!printer) {
      throw new NotFoundException('Printer not found.');
    }
    const now = new Date();
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.printJob.create({
        data: {
          companyId: user.companyId,
          outletId,
          printerId,
          template: PrintTemplate.TEST_PRINT,
          payloadJson: {
            printerName: printer.name,
            requestedBy: user.email,
            requestedAt: now.toISOString(),
          },
          renderedText: [
            printer.outlet.name.toUpperCase(),
            'PRINTER TEST',
            '================================',
            `Printer: ${printer.name}`,
            `Requested: ${now.toISOString()}`,
            'If you can read this, LAN printing is working.',
            '================================',
            '',
          ].join('\n'),
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PRINTER_TEST_QUEUED',
          entityType: 'print_job',
          entityId: created.id,
          reason,
          requestId,
          ipAddress,
        },
      });
      return created;
    });
    this.operations.publishToOutlet(outletId, 'printing.updated', {
      printerId,
      printJobId: job.id,
      action: 'test_queued',
    });
    return job;
  }

  async retry(
    user: AuthenticatedUser,
    outletId: string,
    printJobId: string,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const job = await this.prisma.printJob.findFirst({
      where: { id: printJobId, companyId: user.companyId, outletId },
    });
    if (!job) {
      throw new NotFoundException('Print job not found.');
    }
    if (
      job.status !== PrintJobStatus.FAILED &&
      job.status !== PrintJobStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Only failed or cancelled print jobs can be retried manually.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.RETRYING,
          nextAttemptAt: new Date(),
          leasedByAgentId: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PRINT_JOB_RETRIED',
          entityType: 'print_job',
          entityId: job.id,
          reason,
          requestId,
          ipAddress,
        },
      }),
    ]);
    const updated = await this.prisma.printJob.findUnique({ where: { id: job.id } });
    this.operations.publishToOutlet(outletId, 'printing.updated', {
      printJobId: job.id,
      action: 'retried',
    });
    return updated;
  }

  async reprint(
    user: AuthenticatedUser,
    outletId: string,
    printJobId: string,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const source = await this.prisma.printJob.findFirst({
      where: { id: printJobId, companyId: user.companyId, outletId },
    });
    if (!source) {
      throw new NotFoundException('Print job not found.');
    }
    const reprint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.printJob.create({
        data: {
          companyId: source.companyId,
          outletId: source.outletId,
          orderId: source.orderId,
          kitchenTicketId: source.kitchenTicketId,
          printerId: source.printerId,
          template: source.template,
          payloadJson:
            source.payloadJson === null
              ? {}
              : (source.payloadJson as Prisma.InputJsonValue),
          renderedText: source.renderedText,
          reprintOfId: source.id,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PRINT_JOB_REPRINTED',
          entityType: 'print_job',
          entityId: created.id,
          afterJson: { reprintOfId: source.id },
          reason,
          requestId,
          ipAddress,
        },
      });
      return created;
    });
    this.operations.publishToOutlet(outletId, 'printing.updated', {
      printJobId: reprint.id,
      reprintOfId: source.id,
      action: 'reprinted',
    });
    return reprint;
  }

  async heartbeat(
    agent: AuthenticatedPrinterAgent,
    appVersion: string | undefined,
    ipAddress: string,
  ) {
    const now = new Date();
    await this.prisma.printerAgent.update({
      where: { id: agent.id },
      data: {
        appVersion,
        lastIpAddress: ipAddress,
        lastHeartbeatAt: now,
      },
    });
    return { status: 'ok', serverTime: now };
  }

  async leaseNext(agent: AuthenticatedPrinterAgent) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date();
      const job = await this.prisma.printJob.findFirst({
        where: {
          outletId: agent.outletId,
          printerId: { not: null },
          printer: {
            active: true,
            connectionType: { in: agentConnectionTypes },
          },
          OR: [
            {
              status: {
                in: [PrintJobStatus.QUEUED, PrintJobStatus.RETRYING],
              },
              nextAttemptAt: { lte: now },
            },
            {
              status: PrintJobStatus.SENDING,
              leaseExpiresAt: { lt: now },
            },
          ],
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
      if (!job) {
        return { job: null };
      }

      const leased = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.printJob.updateMany({
          where: {
            id: job.id,
            OR: [
              {
                status: {
                  in: [PrintJobStatus.QUEUED, PrintJobStatus.RETRYING],
                },
              },
              {
                status: PrintJobStatus.SENDING,
                leaseExpiresAt: { lt: now },
              },
            ],
          },
          data: {
            status: PrintJobStatus.SENDING,
            leasedByAgentId: agent.id,
            leaseExpiresAt: new Date(now.getTime() + 60_000),
            attemptCount: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          return null;
        }
        const current = await tx.printJob.findUnique({
          where: { id: job.id },
          include: { printer: true },
        });
        if (!current?.printer) {
          return null;
        }
        await tx.printJobAttempt.create({
          data: {
            printJobId: current.id,
            agentId: agent.id,
            attemptNumber: current.attemptCount,
            status: PrintAttemptStatus.SENDING,
          },
        });
        return current;
      });
      if (leased?.printer) {
        return {
          job: {
            id: leased.id,
            template: leased.template,
            renderedText: leased.renderedText,
            payload: leased.payloadJson,
            attemptNumber: leased.attemptCount,
            printer: {
              id: leased.printer.id,
              key: leased.printer.key,
              name: leased.printer.name,
              connectionType: leased.printer.connectionType,
              host: leased.printer.host,
              port: leased.printer.port,
              paperWidthMm: leased.printer.paperWidthMm,
              autoCut: leased.printer.autoCut,
              buzzer: leased.printer.buzzer,
            },
          },
        };
      }
    }
    return { job: null };
  }

  async complete(
    agent: AuthenticatedPrinterAgent,
    printJobId: string,
    message?: string,
  ) {
    const job = await this.loadLeasedJob(agent, printJobId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.PRINTED,
          printedAt: now,
          leaseExpiresAt: null,
          lastError: null,
        },
      }),
      this.prisma.printJobAttempt.update({
        where: {
          printJobId_attemptNumber: {
            printJobId: job.id,
            attemptNumber: job.attemptCount,
          },
        },
        data: {
          status: PrintAttemptStatus.PRINTED,
          completedAt: now,
          errorMessage: message,
        },
      }),
      this.prisma.printer.update({
        where: { id: job.printerId! },
        data: {
          healthStatus: PrinterHealthStatus.ONLINE,
          lastHeartbeatAt: now,
          ...(job.template === PrintTemplate.TEST_PRINT
            ? { lastTestAt: now, lastTestResult: 'printed' }
            : {}),
        },
      }),
    ]);
    this.operations.publishToOutlet(agent.outletId, 'print.job.printed', {
      printJobId: job.id,
      printerId: job.printerId,
    });
    return { status: PrintJobStatus.PRINTED, printedAt: now };
  }

  async fail(
    agent: AuthenticatedPrinterAgent,
    printJobId: string,
    message = 'Printer agent reported a failure.',
  ) {
    const job = await this.loadLeasedJob(agent, printJobId);
    const now = new Date();
    const route = job.printerId
      ? await this.prisma.printerRoute.findFirst({
          where: { primaryPrinterId: job.printerId },
        })
      : null;
    const useBackup =
      job.attemptCount >= 3 &&
      !job.backupRouted &&
      route?.backupPrinterId !== null &&
      route?.backupPrinterId !== undefined;
    const finalFailure = !useBackup && job.attemptCount >= job.maxAttempts;
    const delays = [5_000, 15_000, 60_000];
    const retryDelay =
      delays[Math.min(Math.max(job.attemptCount - 1, 0), delays.length - 1)] ??
      60_000;
    const nextAttemptAt = useBackup
      ? now
      : new Date(now.getTime() + retryDelay);

    await this.prisma.$transaction(async (tx) => {
      await tx.printJobAttempt.update({
        where: {
          printJobId_attemptNumber: {
            printJobId: job.id,
            attemptNumber: job.attemptCount,
          },
        },
        data: {
          status: PrintAttemptStatus.FAILED,
          completedAt: now,
          errorMessage: message,
        },
      });
      await tx.printJob.update({
        where: { id: job.id },
        data: {
          status: finalFailure
            ? PrintJobStatus.FAILED
            : PrintJobStatus.RETRYING,
          printerId: useBackup ? route!.backupPrinterId : job.printerId,
          backupRouted: useBackup || job.backupRouted,
          nextAttemptAt,
          leasedByAgentId: null,
          leaseExpiresAt: null,
          lastError: message,
        },
      });
      if (job.printerId) {
        await tx.printer.update({
          where: { id: job.printerId },
          data: {
            healthStatus: finalFailure
              ? PrinterHealthStatus.OFFLINE
              : PrinterHealthStatus.DEGRADED,
            ...(job.template === PrintTemplate.TEST_PRINT
              ? { lastTestAt: now, lastTestResult: message }
              : {}),
          },
        });
      }
    });
    this.operations.publishToOutlet(agent.outletId, 'print.job.failed', {
      printJobId: job.id,
      printerId: job.printerId,
      status: finalFailure ? PrintJobStatus.FAILED : PrintJobStatus.RETRYING,
      backupRouted: useBackup,
      message,
    });
    return {
      status: finalFailure ? PrintJobStatus.FAILED : PrintJobStatus.RETRYING,
      backupRouted: useBackup,
      nextAttemptAt: finalFailure ? null : nextAttemptAt,
    };
  }

  private validateSetup(dto: SetupPrintersDto): void {
    const stationKeys = dto.stations.map(({ key }) => key);
    const printerKeys = dto.printers.map(({ key }) => key);
    if (new Set(stationKeys).size !== stationKeys.length) {
      throw new BadRequestException('Station keys must be unique.');
    }
    if (new Set(printerKeys).size !== printerKeys.length) {
      throw new BadRequestException('Printer keys must be unique.');
    }
    for (const printer of dto.printers) {
      if (
        printer.connectionType === PrinterConnectionType.ESC_POS_LAN &&
        (!printer.host || !printer.port)
      ) {
        throw new BadRequestException(
          `LAN printer ${printer.key} requires host and port.`,
        );
      }
    }
  }

  private async loadLeasedJob(
    agent: AuthenticatedPrinterAgent,
    printJobId: string,
  ) {
    const job = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        outletId: agent.outletId,
        leasedByAgentId: agent.id,
        status: PrintJobStatus.SENDING,
      },
    });
    if (!job) {
      throw new ConflictException(
        'Print job is not currently leased to this agent.',
      );
    }
    return job;
  }
}
