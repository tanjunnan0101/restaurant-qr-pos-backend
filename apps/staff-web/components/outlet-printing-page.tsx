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
      title="Printing"
      subtitle="Track routes, printers, retries, and receipt recovery from one board."
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

      <section className="operations-layout support-station-layout">
        <aside className="panel section-panel support-control-rail">
          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Print station</p>
                <h2 className="section-title">Network control</h2>
              </div>
              <span className="status-pill success">
                {formatRealtimeStatus(status)}
              </span>
            </div>
            <p className="supporting-copy">
              Keep kitchen and receipt routing visible in one place. This tab is
              for outlet setup, heartbeat checks, retries, and reprint recovery.
            </p>
            <div className="support-inline-meta">
              <span>{stations.length} stations</span>
              <span>{printers.length} printers</span>
              <span>{activeAgents} agents online</span>
              <span>{failedJobs.length} failed jobs</span>
            </div>
            <div className="support-card__actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setRefreshTick((current) => current + 1)}
                type="button"
              >
                {busy ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  setSetupJson(JSON.stringify(buildSampleSetupDraft(), null, 2))
                }
                type="button"
              >
                Load example
              </button>
            </div>
          </article>

          <article className="support-config-card">
            <div className="support-config-card__header">
              <div>
                <p className="eyebrow">Setup payload</p>
                <h3>Route printers and agents</h3>
              </div>
            </div>
            <div className="field">
              <label htmlFor="printing-setup-json">Setup JSON</label>
              <textarea
                id="printing-setup-json"
                onChange={(event) => setSetupJson(event.target.value)}
                rows={22}
                value={setupJson}
              />
            </div>
            <div className="support-card__actions">
              <button
                className="primary-button"
                disabled={setupBusy || setupJson.trim().length === 0}
                onClick={() => void handleSetupSave()}
                type="button"
              >
                {setupBusy ? 'Saving...' : 'Save setup'}
              </button>
            </div>
            {setupSecret ? (
              <div className="alert success">
                Printer agent key returned once: {setupSecret}
              </div>
            ) : null}
          </article>
        </aside>

        <div className="support-board-panel">
          <section className="support-summary-grid">
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Stations</p>
                  <h3>{stations.length}</h3>
                </div>
                <span className="status-pill neutral">Routes</span>
              </div>
              <p className="supporting-copy">
                Kitchen and receipt stations mapped for this outlet.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Printers</p>
                  <h3>{printers.length}</h3>
                </div>
                <span className="status-pill neutral">Devices</span>
              </div>
              <p className="supporting-copy">
                Configured outlet printers across kitchen and receipt roles.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Active printers</p>
                  <h3>{onlinePrinters}</h3>
                </div>
                <span className="status-pill success">Enabled</span>
              </div>
              <p className="supporting-copy">
                Printer records currently marked active.
              </p>
            </article>
            <article className="support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Failed jobs</p>
                  <h3>{failedJobs.length}</h3>
                </div>
                <span className="status-pill warning">Attention</span>
              </div>
              <p className="supporting-copy">
                Jobs waiting for retry or reprint action.
              </p>
            </article>
          </section>

          <section className="support-card-grid">
            <article className="panel section-panel support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Kitchen routes</p>
                  <h2 className="section-title">Station routing</h2>
                </div>
                <span className="status-pill neutral">{stations.length} mapped</span>
              </div>
              {busy ? (
                <p className="supporting-copy">Loading station routes...</p>
              ) : stations.length === 0 ? (
                <p className="supporting-copy">
                  No kitchen stations or printer routes have been configured yet.
                </p>
              ) : (
                <div className="list-block">
                  {stations.map((station) => (
                    <article className="list-item" key={station.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{station.name}</h3>
                          <p className="supporting-copy">
                            Key: {station.key} | Order {station.displayOrder}
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
                      <div className="support-inline-meta">
                        <span>
                          Primary:{' '}
                          {station.printerRoute?.primaryPrinter?.name ?? 'Not routed'}
                        </span>
                        <span>
                          Backup:{' '}
                          {station.printerRoute?.backupPrinter?.name ?? 'None'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="panel section-panel support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Agents</p>
                  <h2 className="section-title">Heartbeat board</h2>
                </div>
                <span className="status-pill neutral">{agents.length} devices</span>
              </div>
              {busy ? (
                <p className="supporting-copy">Loading agent heartbeat...</p>
              ) : agents.length === 0 ? (
                <p className="supporting-copy">
                  No printer agent has been registered for this outlet yet.
                </p>
              ) : (
                <div className="list-block">
                  {agents.map((agent) => (
                    <article className="list-item" key={agent.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{agent.name}</h3>
                          <p className="supporting-copy">Device: {agent.deviceId}</p>
                        </div>
                        <span
                          className={`status-pill ${
                            agent.active ? 'success' : 'warning'
                          }`}
                        >
                          {agent.active ? 'Registered' : 'Inactive'}
                        </span>
                      </div>
                      <div className="support-inline-meta">
                        <span>
                          Last heartbeat:{' '}
                          {agent.lastHeartbeatAt
                            ? new Date(agent.lastHeartbeatAt).toLocaleString()
                            : 'No heartbeat yet'}
                        </span>
                        <span>Version: {agent.appVersion ?? 'Unknown'}</span>
                        <span>IP: {agent.lastIpAddress ?? 'Unknown'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="support-list-grid">
            <article className="panel section-panel support-list-card">
              <div className="support-list-card__header">
                <div>
                  <p className="eyebrow">Printers</p>
                  <h2 className="section-title">Device roster</h2>
                </div>
                <span className="status-pill neutral">{printers.length} devices</span>
              </div>
              {busy ? (
                <p className="supporting-copy">Loading printers...</p>
              ) : printers.length === 0 ? (
                <p className="supporting-copy">
                  No outlet printers are configured yet.
                </p>
              ) : (
                <div className="list-block">
                  {printers.map((printer) => (
                    <article className="list-item" key={printer.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{printer.name}</h3>
                          <p className="supporting-copy">
                            {formatEnum(printer.role)} |{' '}
                            {formatEnum(printer.connectionType)}
                          </p>
                        </div>
                        <span
                          className={`status-pill ${
                            printer.active ? 'success' : 'neutral'
                          }`}
                        >
                          {printer.active ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="support-inline-meta">
                        <span>
                          {printer.host
                            ? `${printer.host}:${printer.port ?? 9100}`
                            : 'No host configured'}
                        </span>
                        <span>{printer.paperWidthMm}mm paper</span>
                        <span>Health: {formatEnum(printer.healthStatus)}</span>
                      </div>
                      <div className="support-list-card__actions">
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
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="panel section-panel support-list-card">
              <div className="support-list-card__header">
                <div>
                  <p className="eyebrow">Recovery</p>
                  <h2 className="section-title">Failed jobs</h2>
                </div>
                <span className="status-pill warning">{failedJobs.length} waiting</span>
              </div>
              {busy ? (
                <p className="supporting-copy">Loading print jobs...</p>
              ) : failedJobs.length === 0 ? (
                <p className="supporting-copy">
                  No failed or retrying print jobs are waiting for action.
                </p>
              ) : (
                <div className="list-block">
                  {failedJobs.map((job) => (
                    <article className="list-item" key={job.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{formatEnum(job.template)}</h3>
                          <p className="supporting-copy">
                            Printer: {job.printer?.name ?? 'Unassigned'}
                          </p>
                        </div>
                        <span className="status-pill warning">
                          {formatEnum(job.status)}
                        </span>
                      </div>
                      <div className="support-inline-meta">
                        <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
                        {job.lastError ? <span>{job.lastError}</span> : null}
                      </div>
                      <div className="support-list-card__actions">
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
                          {actionBusyId === job.id ? 'Working...' : 'Retry'}
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
                          {actionBusyId === job.id ? 'Working...' : 'Reprint'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        </div>
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
