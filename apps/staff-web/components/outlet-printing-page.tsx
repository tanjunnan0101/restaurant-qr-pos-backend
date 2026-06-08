'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  getOutletAuditLogs,
  getPrintingOperations,
  queuePrinterTest,
  reprintJob,
  retryPrintJob,
  setupPrinting,
} from '@/lib/api';
import { OutletAuditFeed } from '@/components/outlet-audit-feed';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  OutletAuditLogEntry,
  OutletPrintingOperationsResponse,
  PrintingSetupPayload,
  RealtimeStatus,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

type ActionKind = 'test' | 'retry' | 'reprint';

export function OutletPrintingPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [data, setData] = useState<OutletPrintingOperationsResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [setupJson, setSetupJson] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<OutletAuditLogEntry[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueRefresh = useEffectEvent(() => {
    if (refreshTimerRef.current) {
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshTick((current) => current + 1);
    }, 250);
  });

  useEffect(() => {
    if (!session?.accessToken || !outletId) {
      setData(null);
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      setStatus('connecting');
      setError(null);
      try {
        const [result, audit] = await Promise.all([
          getPrintingOperations(authToken, outletId),
          getOutletAuditLogs(authToken, outletId, { limit: 30 }),
        ]);
        if (!cancelled) {
          setData(result);
          setAuditEntries(
            audit.entries.filter(
              (entry) =>
                entry.actionType.startsWith('PRINT') ||
                entry.actionType.startsWith('PRINTER'),
            ),
          );
          setSetupJson((current) =>
            current.trim().length > 0
              ? current
              : JSON.stringify(buildSetupDraft(result), null, 2),
          );
          setStatus('connected');
        }
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setStatus('error');
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Printing operations failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [outletId, refreshTick, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId) {
      setStatus('idle');
      return;
    }

    const socket = createOperationsSocket(session.accessToken);
    const subscribeToOutlet = () => {
      socket.emit('subscribe.outlet', { outletId }, () => {
        setStatus('connected');
      });
    };
    const handleConnect = () => {
      setStatus('connecting');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('error'));
    socket.on('operations.connected', subscribeToOutlet);
    for (const eventName of outletOperationsEvents) {
      socket.on(eventName, queueRefresh);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.off('connect', handleConnect);
      socket.off('operations.connected', subscribeToOutlet);
      socket.disconnect();
    };
  }, [outletId, queueRefresh, session]);

  async function handleAction(
    kind: ActionKind,
    targetId: string,
    reason: string,
  ) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Proceed with this printing action?\n\n${reason}`)
    ) {
      return;
    }

    setActionBusyId(targetId);
    setError(null);
    try {
      if (kind === 'test') {
        await queuePrinterTest(session.accessToken, outletId, targetId, {
          reason,
        });
      } else if (kind === 'retry') {
        await retryPrintJob(session.accessToken, outletId, targetId, {
          reason,
        });
      } else {
        await reprintJob(session.accessToken, outletId, targetId, {
          reason,
        });
      }
      setRefreshTick((current) => current + 1);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Printing action failed.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  const printers = data?.printers ?? [];
  const agents = data?.agents ?? [];
  const stations = data?.stations ?? [];
  const failedJobs = data?.failedJobs ?? [];
  const onlinePrinters = printers.filter((printer) => printer.active).length;
  const activeAgents = agents.filter((agent) => agent.active).length;

  async function handleSetupSave() {
    if (!session?.accessToken || !outletId) {
      return;
    }

    let parsed: PrintingSetupPayload;
    try {
      parsed = JSON.parse(setupJson) as PrintingSetupPayload;
    } catch {
      setError('Printing setup JSON is not valid.');
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Save this printing setup to the outlet? This can change routes, printers, and agent registration.',
      )
    ) {
      return;
    }

    setSetupBusy(true);
    setError(null);
    setSetupSecret(null);
    try {
      const response = await setupPrinting(session.accessToken, outletId, parsed);
      setData(response.configuration);
      setSetupJson(
        JSON.stringify(buildSetupDraft(response.configuration), null, 2),
      );
      setSetupSecret(
        response.agent?.key
          ? `${response.agent.key} - ${response.agent.note}`
          : response.agent?.note ?? null,
      );
      setRefreshTick((current) => current + 1);
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : 'Failed to save printing setup.',
      );
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <OutletPageLayout
      title="Printing operations"
      subtitle="Monitor kitchen routing, printer connectivity, and recovery actions from one outlet screen."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {outletBusy ? (
        <section className="panel section-panel">
          <p className="supporting-copy">Loading outlet context...</p>
        </section>
      ) : null}

      {outletError ? (
        <section className="panel section-panel">
          <div className="alert error">{outletError}</div>
        </section>
      ) : null}

      {error ? (
        <section className="panel section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : null}

      <section className="metric-board">
        <article className="panel metric-card">
          <span className="metric-label">Stations</span>
          <strong className="metric-value">{stations.length}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Printers</span>
          <strong className="metric-value">{printers.length}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Active printers</span>
          <strong className="metric-value">{onlinePrinters}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Active agents</span>
          <strong className="metric-value">{activeAgents}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Failed jobs</span>
          <strong className="metric-value">{failedJobs.length}</strong>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Outlet print network</p>
            <h2 className="section-title serif">Printing health board</h2>
            <p className="supporting-copy">
              Refresh state: {formatRealtimeStatus(status)}
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setRefreshTick((current) => current + 1)}
            type="button"
          >
            {busy ? 'Refreshing...' : 'Refresh printing status'}
          </button>
        </div>
        <p className="supporting-copy">
          This page is designed to stay useful even before a live printer is on
          hand: routes, assigned devices, agent heartbeat, and failed jobs can
          all be reviewed here first.
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel section-panel">
          <h2 className="section-title serif">Setup payload</h2>
          <p className="supporting-copy">
            Prepare or update stations, printers, routes, and printer-agent
            registration from one JSON payload. This is useful while staging the
            outlet before the physical device is on site.
          </p>
          <div className="field">
            <label htmlFor="printing-setup-json">Setup JSON</label>
            <textarea
              id="printing-setup-json"
              onChange={(event) => setSetupJson(event.target.value)}
              rows={22}
              value={setupJson}
            />
          </div>
          <div className="inline-actions">
            <button
              className="primary-button"
              disabled={setupBusy || setupJson.trim().length === 0}
              onClick={() => void handleSetupSave()}
              type="button"
            >
              {setupBusy ? 'Saving setup...' : 'Save printing setup'}
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                setSetupJson(JSON.stringify(buildSampleSetupDraft(), null, 2))
              }
              type="button"
            >
              Load starter example
            </button>
          </div>
          {setupSecret ? (
            <div className="alert success">
              Printer agent key returned once: {setupSecret}
            </div>
          ) : null}
        </article>

        <article className="panel section-panel">
          <h2 className="section-title serif">Kitchen routes</h2>
          {busy ? (
            <p className="supporting-copy">Loading station routes...</p>
          ) : stations.length === 0 ? (
            <p className="supporting-copy">
              No kitchen stations or printer routes have been configured yet.
            </p>
          ) : (
            <div className="stack-list">
              {stations.map((station) => (
                <div className="stack-row" key={station.id}>
                  <div>
                    <strong>{station.name}</strong>
                    <p className="supporting-copy">
                      Key: {station.key} | Display order: {station.displayOrder}
                    </p>
                    <p className="supporting-copy">
                      Primary:{' '}
                      {station.printerRoute?.primaryPrinter?.name ?? 'Not routed'}
                      {station.printerRoute?.backupPrinter
                        ? ` | Backup: ${station.printerRoute.backupPrinter.name}`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={`status-pill ${
                      station.active ? 'success' : 'neutral'
                    }`}
                  >
                    {station.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel section-panel">
          <h2 className="section-title serif">Printer agents</h2>
          {busy ? (
            <p className="supporting-copy">Loading agent heartbeat...</p>
          ) : agents.length === 0 ? (
            <p className="supporting-copy">
              No printer agent has been registered for this outlet yet.
            </p>
          ) : (
            <div className="stack-list">
              {agents.map((agent) => (
                <div className="stack-row" key={agent.id}>
                  <div>
                    <strong>{agent.name}</strong>
                    <p className="supporting-copy">Device: {agent.deviceId}</p>
                    <p className="supporting-copy">
                      Last heartbeat:{' '}
                      {agent.lastHeartbeatAt
                        ? new Date(agent.lastHeartbeatAt).toLocaleString()
                        : 'No heartbeat yet'}
                    </p>
                    <p className="supporting-copy">
                      App version: {agent.appVersion ?? 'Unknown'} | IP:{' '}
                      {agent.lastIpAddress ?? 'Unknown'}
                    </p>
                  </div>
                  <span
                    className={`status-pill ${agent.active ? 'success' : 'warning'}`}
                  >
                    {agent.active ? 'Registered' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel section-panel">
          <h2 className="section-title serif">Printers</h2>
          {busy ? (
            <p className="supporting-copy">Loading printers...</p>
          ) : printers.length === 0 ? (
            <p className="supporting-copy">
              No outlet printers are configured yet.
            </p>
          ) : (
            <div className="stack-list">
              {printers.map((printer) => (
                <div className="stack-row" key={printer.id}>
                  <div>
                    <strong>{printer.name}</strong>
                    <p className="supporting-copy">
                      {formatEnum(printer.role)} |{' '}
                      {formatEnum(printer.connectionType)}
                    </p>
                    <p className="supporting-copy">
                      {printer.host
                        ? `${printer.host}:${printer.port ?? 9100}`
                        : 'No host configured'}{' '}
                      | {printer.paperWidthMm}mm paper
                    </p>
                    <p className="supporting-copy">
                      Health: {formatEnum(printer.healthStatus)}
                    </p>
                  </div>
                  <div className="inline-actions">
                    <span
                      className={`status-pill ${
                        printer.active ? 'success' : 'neutral'
                      }`}
                    >
                      {printer.active ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      className="secondary-button"
                      disabled={actionBusyId === printer.id || !printer.active}
                      onClick={() =>
                        void handleAction(
                          'test',
                          printer.id,
                          `Staff queued a printer test for ${printer.name}.`,
                        )
                      }
                      type="button"
                    >
                      {actionBusyId === printer.id
                        ? 'Queueing...'
                        : 'Queue test print'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel section-panel">
          <h2 className="section-title serif">Failed and retrying jobs</h2>
          {busy ? (
            <p className="supporting-copy">Loading print jobs...</p>
          ) : failedJobs.length === 0 ? (
            <p className="supporting-copy">
              No failed or retrying print jobs are waiting for action.
            </p>
          ) : (
            <div className="stack-list">
              {failedJobs.map((job) => (
                <div className="stack-row" key={job.id}>
                  <div>
                    <strong>{formatEnum(job.template)}</strong>
                    <p className="supporting-copy">
                      Printer: {job.printer?.name ?? 'Unassigned'}
                    </p>
                    <p className="supporting-copy">
                      Status: {formatEnum(job.status)} | Created:{' '}
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                    {job.lastError ? (
                      <p className="supporting-copy">Last error: {job.lastError}</p>
                    ) : null}
                  </div>
                  <div className="inline-actions">
                    <button
                      className="secondary-button"
                      disabled={actionBusyId === job.id}
                      onClick={() =>
                        void handleAction(
                          'retry',
                          job.id,
                          `Staff retried failed print job ${job.id}.`,
                        )
                      }
                      type="button"
                    >
                      {actionBusyId === job.id ? 'Working...' : 'Retry job'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={actionBusyId === job.id}
                      onClick={() =>
                        void handleAction(
                          'reprint',
                          job.id,
                          `Staff queued a reprint from job ${job.id}.`,
                        )
                      }
                      type="button"
                    >
                      {actionBusyId === job.id ? 'Working...' : 'Reprint copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <OutletAuditFeed
        entries={auditEntries}
        subtitle="Configuration changes, queued tests, retries, reprints, and print outcomes for this outlet."
        title="Printing activity"
      />
    </OutletPageLayout>
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRealtimeStatus(status: RealtimeStatus) {
  switch (status) {
    case 'connected':
      return 'Current';
    case 'connecting':
      return 'Refreshing';
    case 'error':
      return 'Needs attention';
    case 'offline':
      return 'Offline';
    default:
      return 'Idle';
  }
}

function buildSetupDraft(
  configuration: OutletPrintingOperationsResponse,
): PrintingSetupPayload {
  return {
    stations: configuration.stations.map((station) => ({
      key: station.key,
      name: station.name,
      displayOrder: station.displayOrder,
      active: station.active,
    })),
    printers: configuration.printers.map((printer) => ({
      key: printer.key,
      name: printer.name,
      connectionType: printer.connectionType,
      role: printer.role,
      host: printer.host ?? undefined,
      port: printer.port ?? undefined,
      paperWidthMm: printer.paperWidthMm,
      autoCut: printer.autoCut,
      buzzer: printer.buzzer,
      cashDrawer: printer.cashDrawer,
      active: printer.active,
    })),
    routes: configuration.stations
      .filter((station) => station.printerRoute?.primaryPrinter?.key)
      .map((station) => ({
        stationKey: station.key,
        primaryPrinterKey:
          station.printerRoute?.primaryPrinter?.key ?? 'kitchen-main',
        ...(station.printerRoute?.backupPrinter?.key
          ? { backupPrinterKey: station.printerRoute.backupPrinter.key }
          : {}),
      })),
    agent: configuration.agents[0]
      ? {
          deviceId: configuration.agents[0].deviceId,
          name: configuration.agents[0].name,
          rotateKey: false,
        }
      : undefined,
  };
}

function buildSampleSetupDraft(): PrintingSetupPayload {
  return {
    stations: [
      {
        key: 'main-kitchen',
        name: 'Main Kitchen',
        displayOrder: 0,
        active: true,
      },
      {
        key: 'drinks-bar',
        name: 'Drinks Bar',
        displayOrder: 1,
        active: true,
      },
    ],
    printers: [
      {
        key: 'kitchen-main',
        name: 'Kitchen Main Printer',
        connectionType: 'ESC_POS_LAN',
        role: 'KITCHEN',
        host: '192.168.1.50',
        port: 9100,
        paperWidthMm: 80,
        autoCut: true,
        buzzer: false,
        cashDrawer: false,
        active: true,
      },
      {
        key: 'receipt-counter',
        name: 'Receipt Counter Printer',
        connectionType: 'ESC_POS_LAN',
        role: 'RECEIPT',
        host: '192.168.1.51',
        port: 9100,
        paperWidthMm: 80,
        autoCut: true,
        buzzer: false,
        cashDrawer: true,
        active: true,
      },
    ],
    routes: [
      {
        stationKey: 'main-kitchen',
        primaryPrinterKey: 'kitchen-main',
      },
    ],
    agent: {
      deviceId: 'staging-counter-pc',
      name: 'Counter Windows Agent',
      rotateKey: false,
    },
  };
}
