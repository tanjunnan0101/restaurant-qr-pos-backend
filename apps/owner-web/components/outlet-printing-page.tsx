'use client';

import { useEffect, useState } from 'react';
import {
  getPrinting,
  queuePrinterTest,
  reprintJob,
  retryPrintJob,
  setupPrinting,
} from '@/lib/api';
import type {
  PrinterConnectionType,
  PrinterRole,
  PrintingConfiguration,
  SetupPrintingInput,
  SetupPrintingResponse,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const CONNECTION_TYPES: PrinterConnectionType[] = [
  'ESC_POS_LAN',
  'ESC_POS_USB_BRIDGE',
  'BLUETOOTH_BRIDGE',
  'EPSON_EPOS',
  'BROWSER',
  'PDF',
];

const PRINTER_ROLES: PrinterRole[] = ['KITCHEN', 'BAR', 'RECEIPT', 'BACKUP'];

export function OutletPrintingPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [printing, setPrinting] = useState<PrintingConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupPrintingResponse | null>(
    null,
  );
  const [testBusyPrinterId, setTestBusyPrinterId] = useState<string | null>(
    null,
  );
  const [retryBusyJobId, setRetryBusyJobId] = useState<string | null>(null);
  const [reprintBusyJobId, setReprintBusyJobId] = useState<string | null>(null);
  const [stationLines, setStationLines] = useState('');
  const [printerLines, setPrinterLines] = useState('');
  const [routeLines, setRouteLines] = useState('');
  const [agentDeviceId, setAgentDeviceId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [rotateAgentKey, setRotateAgentKey] = useState(false);
  const [testReason, setTestReason] = useState<Record<string, string>>({});
  const [retryReason, setRetryReason] = useState<Record<string, string>>({});
  const [reprintReason, setReprintReason] = useState<Record<string, string>>(
    {},
  );
  const [testOpen, setTestOpen] = useState<Record<string, boolean>>({});
  const [retryOpen, setRetryOpen] = useState<Record<string, boolean>>({});
  const [reprintOpen, setReprintOpen] = useState<Record<string, boolean>>({});

  async function refreshPrinting(authToken: string) {
    const response = await getPrinting(authToken, outletId);
    setPrinting(response);
    setError(null);
    return response;
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;

    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const response = await getPrinting(authToken, outletId);
        if (!cancelled) {
          setPrinting(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load printing configuration.',
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
  }, [outletId, session]);

  async function handleSetupSubmit() {
    if (!session?.accessToken) {
      return;
    }

    const parsedStations = parseStationLines(stationLines);
    if ('error' in parsedStations) {
      setActionError(parsedStations.error);
      setActionSuccess(null);
      return;
    }

    const parsedPrinters = parsePrinterLines(printerLines);
    if ('error' in parsedPrinters) {
      setActionError(parsedPrinters.error);
      setActionSuccess(null);
      return;
    }

    const parsedRoutes = parseRouteLines(routeLines);
    if ('error' in parsedRoutes) {
      setActionError(parsedRoutes.error);
      setActionSuccess(null);
      return;
    }

    const payload: SetupPrintingInput = {
      stations: parsedStations.stations,
      printers: parsedPrinters.printers,
      routes: parsedRoutes.routes,
      agent:
        agentDeviceId.trim() && agentName.trim()
          ? {
              deviceId: agentDeviceId.trim(),
              name: agentName.trim(),
              rotateKey: rotateAgentKey,
            }
          : undefined,
    };

    setSetupBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await setupPrinting(
        session.accessToken,
        outletId,
        payload,
      );
      setSetupResult(result);
      setPrinting(result.configuration);
      setActionSuccess(
        `Saved ${payload.stations.length} stations, ${payload.printers.length} printers, and ${payload.routes.length} routes.`,
      );
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to save printing configuration.',
      );
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleTestPrint(printerId: string) {
    if (!session?.accessToken) {
      return;
    }
    const reason = testReason[printerId]?.trim();
    if (!reason) {
      setActionError('A test-print reason is required.');
      setActionSuccess(null);
      return;
    }

    setTestBusyPrinterId(printerId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await queuePrinterTest(
        session.accessToken,
        outletId,
        printerId,
        {
          reason,
        },
      );
      await refreshPrinting(session.accessToken);
      setActionSuccess(`Queued test print ${result.id}.`);
      setTestOpen((current) => ({ ...current, [printerId]: false }));
      setTestReason((current) => ({ ...current, [printerId]: '' }));
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to queue a test print.',
      );
    } finally {
      setTestBusyPrinterId(null);
    }
  }

  async function handleRetry(printJobId: string) {
    if (!session?.accessToken) {
      return;
    }
    const reason = retryReason[printJobId]?.trim();
    if (!reason) {
      setActionError('A retry reason is required.');
      setActionSuccess(null);
      return;
    }

    setRetryBusyJobId(printJobId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await retryPrintJob(
        session.accessToken,
        outletId,
        printJobId,
        { reason },
      );
      await refreshPrinting(session.accessToken);
      setActionSuccess(`Queued retry for print job ${result.id}.`);
      setRetryOpen((current) => ({ ...current, [printJobId]: false }));
      setRetryReason((current) => ({ ...current, [printJobId]: '' }));
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to retry this print job.',
      );
    } finally {
      setRetryBusyJobId(null);
    }
  }

  async function handleReprint(printJobId: string) {
    if (!session?.accessToken) {
      return;
    }
    const reason = reprintReason[printJobId]?.trim();
    if (!reason) {
      setActionError('A reprint reason is required.');
      setActionSuccess(null);
      return;
    }

    setReprintBusyJobId(printJobId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await reprintJob(
        session.accessToken,
        outletId,
        printJobId,
        {
          reason,
        },
      );
      await refreshPrinting(session.accessToken);
      setActionSuccess(`Queued reprint job ${result.id}.`);
      setReprintOpen((current) => ({ ...current, [printJobId]: false }));
      setReprintReason((current) => ({ ...current, [printJobId]: '' }));
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create a reprint job.',
      );
    } finally {
      setReprintBusyJobId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Printing"
      subtitle="Configure stations and printers, then queue test prints and recover failed jobs from the owner workspace."
    >
      {outlet && <OutletHeader outlet={outlet} />}

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Printing setup</p>
            <h2 className="serif">
              Configure stations, printers, routes, and agent
            </h2>
            <p>
              This setup maps directly to the existing backend printing
              configuration endpoint. You can stage the printer layout now even
              before a real printer is on hand.
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="station-lines">Stations</label>
          <textarea
            id="station-lines"
            onChange={(event) => setStationLines(event.target.value)}
            placeholder={
              'main-kitchen | Main Kitchen | 0\nbar | Drinks Bar | 1'
            }
            rows={4}
            value={stationLines}
          />
          <span className="helper-text">
            One per line: `key | name | displayOrder`
          </span>
        </div>

        <div className="field">
          <label htmlFor="printer-lines">Printers</label>
          <textarea
            id="printer-lines"
            onChange={(event) => setPrinterLines(event.target.value)}
            placeholder={
              'kitchen-main | Kitchen Main | ESC_POS_LAN | KITCHEN | 192.168.1.50 | 9100 | 80\nreceipt-front | Front Receipt | ESC_POS_LAN | RECEIPT | 192.168.1.51 | 9100 | 80'
            }
            rows={6}
            value={printerLines}
          />
          <span className="helper-text">
            One per line: `key | name | connectionType | role | host | port |
            paperWidthMm`
          </span>
        </div>

        <div className="field">
          <label htmlFor="route-lines">Routes</label>
          <textarea
            id="route-lines"
            onChange={(event) => setRouteLines(event.target.value)}
            placeholder={
              'main-kitchen | kitchen-main\nbar | receipt-front | kitchen-main'
            }
            rows={4}
            value={routeLines}
          />
          <span className="helper-text">
            One per line: `stationKey | primaryPrinterKey | backupPrinterKey`
          </span>
        </div>

        <div className="detail-grid">
          <div className="field">
            <label htmlFor="agent-device-id">Agent device ID</label>
            <input
              id="agent-device-id"
              onChange={(event) => setAgentDeviceId(event.target.value)}
              placeholder="owner-laptop-01"
              value={agentDeviceId}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-name">Agent name</label>
            <input
              id="agent-name"
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="Front desk bridge"
              value={agentName}
            />
          </div>
        </div>

        <label className="checkbox-row">
          <input
            checked={rotateAgentKey}
            onChange={(event) => setRotateAgentKey(event.target.checked)}
            type="checkbox"
          />
          <span>Rotate the printer-agent key when saving this setup.</span>
        </label>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={setupBusy}
            onClick={() => void handleSetupSubmit()}
            type="button"
          >
            {setupBusy ? 'Saving printing setup...' : 'Save printing setup'}
          </button>
        </div>

        {actionError && <div className="alert error">{actionError}</div>}
        {actionSuccess && <div className="alert success">{actionSuccess}</div>}

        {setupResult?.agent && (
          <div className="control-panel">
            <p className="eyebrow">Printer agent key</p>
            <p>{setupResult.agent.note}</p>
            <div className="info-card">
              <span className="metric-label">Agent ID</span>
              <span className="metric-value scope-card-value">
                {setupResult.agent.id}
              </span>
              <p className="metric-note">
                {setupResult.agent.key ??
                  'Existing key retained; no new key was issued.'}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Live configuration</p>
            <h2 className="serif">
              Current printers, stations, agents, and failed jobs
            </h2>
          </div>
        </div>

        {loading || outletBusy || busy ? (
          <p>Loading printing configuration...</p>
        ) : outletError || error ? (
          <div className="alert error">{outletError ?? error}</div>
        ) : !printing ? (
          <div className="empty-state">
            <strong>No printing configuration returned.</strong>
          </div>
        ) : (
          <>
            <div className="detail-grid">
              <article className="dashboard-card">
                <span className="metric-label">Stations</span>
                <span className="metric-value">{printing.stations.length}</span>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Printers</span>
                <span className="metric-value">{printing.printers.length}</span>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Agents</span>
                <span className="metric-value">{printing.agents.length}</span>
              </article>
              <article className="dashboard-card">
                <span className="metric-label">Failed jobs</span>
                <span className="metric-value">
                  {printing.failedJobs.length}
                </span>
              </article>
            </div>

            <div className="list-block">
              {printing.printers.map((printer) => {
                const open = testOpen[printer.id] ?? false;
                const reason = testReason[printer.id] ?? '';
                return (
                  <article className="list-item" key={printer.id}>
                    <div className="section-header">
                      <div>
                        <h3>{printer.name}</h3>
                        <p>
                          {printer.role} • {printer.connectionType}
                        </p>
                      </div>
                      <div className="badge-row">
                        <span className="badge">{printer.healthStatus}</span>
                        <span
                          className={
                            printer.active ? 'badge success' : 'badge danger'
                          }
                        >
                          {printer.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <p>
                      {printer.host ?? 'No host'}
                      {printer.port ? `:${printer.port}` : ''}
                    </p>
                    <p className="metric-note">
                      Last test {printer.lastTestAt ?? 'never'} • Result{' '}
                      {printer.lastTestResult ?? 'n/a'}
                    </p>
                    <div className="action-row">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setTestOpen((current) => ({
                            ...current,
                            [printer.id]: !open,
                          }))
                        }
                        type="button"
                      >
                        {open ? 'Close' : 'Queue test print'}
                      </button>
                    </div>

                    {open && (
                      <div className="control-panel">
                        <div className="field">
                          <label htmlFor={`test-reason-${printer.id}`}>
                            Test-print reason
                          </label>
                          <textarea
                            id={`test-reason-${printer.id}`}
                            onChange={(event) =>
                              setTestReason((current) => ({
                                ...current,
                                [printer.id]: event.target.value,
                              }))
                            }
                            placeholder="Test after setup, troubleshooting, or network changes."
                            rows={3}
                            value={reason}
                          />
                        </div>
                        <div className="action-row">
                          <button
                            className="primary-button"
                            disabled={
                              testBusyPrinterId === printer.id || !reason.trim()
                            }
                            onClick={() => void handleTestPrint(printer.id)}
                            type="button"
                          >
                            {testBusyPrinterId === printer.id
                              ? 'Queueing...'
                              : 'Confirm test print'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}

              {printing.agents.length > 0 && (
                <article className="list-item">
                  <div className="section-header">
                    <div>
                      <h3>Printer agents</h3>
                      <p>Connected bridge devices for local or LAN printing.</p>
                    </div>
                  </div>
                  <div className="detail-grid">
                    {printing.agents.map((agent) => (
                      <article className="info-card" key={agent.id}>
                        <span className="metric-label">{agent.name}</span>
                        <span className="metric-value scope-card-value">
                          {agent.deviceId}
                        </span>
                        <p className="metric-note">
                          Last heartbeat {agent.lastHeartbeatAt ?? 'never'}
                        </p>
                      </article>
                    ))}
                  </div>
                </article>
              )}

              {printing.failedJobs.length > 0 && (
                <article className="list-item">
                  <div className="section-header">
                    <div>
                      <h3>Failed or retrying jobs</h3>
                      <p>
                        Manual recovery controls for queued printing issues.
                      </p>
                    </div>
                  </div>
                  <div className="list-block">
                    {printing.failedJobs.map((job) => {
                      const retryVisible = retryOpen[job.id] ?? false;
                      const reprintVisible = reprintOpen[job.id] ?? false;
                      const retryValue = retryReason[job.id] ?? '';
                      const reprintValue = reprintReason[job.id] ?? '';
                      return (
                        <article className="info-card" key={job.id}>
                          <div className="section-header">
                            <div>
                              <span className="metric-label">
                                {job.template}
                              </span>
                              <span className="metric-value scope-card-value">
                                {job.status}
                              </span>
                            </div>
                            <div className="badge-row">
                              <span className="badge danger">{job.status}</span>
                            </div>
                          </div>
                          <p className="metric-note">
                            Printer {job.printer?.name ?? 'unknown'} • Created{' '}
                            {job.createdAt}
                          </p>
                          <p className="metric-note">
                            {job.lastError ?? 'No stored error message.'}
                          </p>
                          <div className="action-row">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setRetryOpen((current) => ({
                                  ...current,
                                  [job.id]: !retryVisible,
                                }))
                              }
                              type="button"
                            >
                              {retryVisible ? 'Close retry' : 'Retry job'}
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setReprintOpen((current) => ({
                                  ...current,
                                  [job.id]: !reprintVisible,
                                }))
                              }
                              type="button"
                            >
                              {reprintVisible ? 'Close reprint' : 'Reprint job'}
                            </button>
                          </div>

                          {retryVisible && (
                            <div className="control-panel">
                              <div className="field">
                                <label htmlFor={`retry-reason-${job.id}`}>
                                  Retry reason
                                </label>
                                <textarea
                                  id={`retry-reason-${job.id}`}
                                  onChange={(event) =>
                                    setRetryReason((current) => ({
                                      ...current,
                                      [job.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Explain why this job should be retried."
                                  rows={3}
                                  value={retryValue}
                                />
                              </div>
                              <div className="action-row">
                                <button
                                  className="primary-button"
                                  disabled={
                                    retryBusyJobId === job.id ||
                                    !retryValue.trim()
                                  }
                                  onClick={() => void handleRetry(job.id)}
                                  type="button"
                                >
                                  {retryBusyJobId === job.id
                                    ? 'Retrying...'
                                    : 'Confirm retry'}
                                </button>
                              </div>
                            </div>
                          )}

                          {reprintVisible && (
                            <div className="control-panel">
                              <div className="field">
                                <label htmlFor={`reprint-reason-${job.id}`}>
                                  Reprint reason
                                </label>
                                <textarea
                                  id={`reprint-reason-${job.id}`}
                                  onChange={(event) =>
                                    setReprintReason((current) => ({
                                      ...current,
                                      [job.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Explain why this ticket or receipt should be reprinted."
                                  rows={3}
                                  value={reprintValue}
                                />
                              </div>
                              <div className="action-row">
                                <button
                                  className="primary-button"
                                  disabled={
                                    reprintBusyJobId === job.id ||
                                    !reprintValue.trim()
                                  }
                                  onClick={() => void handleReprint(job.id)}
                                  type="button"
                                >
                                  {reprintBusyJobId === job.id
                                    ? 'Reprinting...'
                                    : 'Confirm reprint'}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </article>
              )}

              {printing.printers.length === 0 && (
                <div className="empty-state">
                  <strong>No printers configured yet.</strong>
                  <p>
                    Use the setup form above to add stations, printers, routes,
                    and an optional printer-agent device.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </OutletPageLayout>
  );
}

function parseStationLines(
  input: string,
): { stations: SetupPrintingInput['stations'] } | { error: string } {
  const lines = normalizeLines(input);
  if (lines.length === 0) {
    return {
      error: 'Add at least one station line before saving printing setup.',
    };
  }

  const stations: SetupPrintingInput['stations'] = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2) {
      return { error: 'Station lines must include `key | name`.' };
    }
    const [key, name, displayOrderText] = parts;
    const displayOrder = displayOrderText
      ? Number(displayOrderText)
      : stations.length;
    if (!key || !name) {
      return { error: 'Station key and name are both required.' };
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      return {
        error: `Display order must be 0 or greater for station ${key}.`,
      };
    }
    stations.push({
      key,
      name,
      displayOrder,
      active: true,
    });
  }
  return { stations };
}

function parsePrinterLines(
  input: string,
): { printers: SetupPrintingInput['printers'] } | { error: string } {
  const lines = normalizeLines(input);
  if (lines.length === 0) {
    return {
      error: 'Add at least one printer line before saving printing setup.',
    };
  }

  const printers: SetupPrintingInput['printers'] = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 4) {
      return {
        error:
          'Printer lines must include `key | name | connectionType | role`.',
      };
    }
    const [key, name, connectionTypeRaw, roleRaw, host, portText, widthText] =
      parts;
    const connectionType =
      connectionTypeRaw.toUpperCase() as PrinterConnectionType;
    const role = roleRaw.toUpperCase() as PrinterRole;
    if (!CONNECTION_TYPES.includes(connectionType)) {
      return {
        error: `Unsupported connection type ${connectionTypeRaw} for printer ${key}.`,
      };
    }
    if (!PRINTER_ROLES.includes(role)) {
      return {
        error: `Unsupported printer role ${roleRaw} for printer ${key}.`,
      };
    }
    const port = portText ? Number(portText) : 9100;
    const paperWidthMm = widthText ? Number(widthText) : 80;
    if (
      connectionType === 'ESC_POS_LAN' &&
      (!host || !Number.isInteger(port) || port < 1)
    ) {
      return {
        error: `LAN printer ${key} requires both a valid host and port.`,
      };
    }
    printers.push({
      key,
      name,
      connectionType,
      role,
      host: host || undefined,
      port: Number.isInteger(port) ? port : undefined,
      paperWidthMm: Number.isInteger(paperWidthMm) ? paperWidthMm : undefined,
      autoCut: true,
      buzzer: false,
      cashDrawer: false,
      active: true,
    });
  }
  return { printers };
}

function parseRouteLines(
  input: string,
): { routes: SetupPrintingInput['routes'] } | { error: string } {
  const lines = normalizeLines(input);
  if (lines.length === 0) {
    return {
      error: 'Add at least one route line before saving printing setup.',
    };
  }

  const routes: SetupPrintingInput['routes'] = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2) {
      return {
        error: 'Route lines must include `stationKey | primaryPrinterKey`.',
      };
    }
    const [stationKey, primaryPrinterKey, backupPrinterKey] = parts;
    if (!stationKey || !primaryPrinterKey) {
      return {
        error: 'Route lines need both a station key and primary printer key.',
      };
    }
    routes.push({
      stationKey,
      primaryPrinterKey,
      backupPrinterKey: backupPrinterKey || undefined,
    });
  }
  return { routes };
}

function normalizeLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
