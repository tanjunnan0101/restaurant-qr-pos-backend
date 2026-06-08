'use client';

import { useEffect, useState } from 'react';
import { getTables, rotateTableQr, setupTables } from '@/lib/api';
import type {
  DiningTableShape,
  RotateQrResponse,
  SetupDiningTablesInput,
  SetupDiningTablesResponse,
  TableZone,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const SHAPE_OPTIONS: DiningTableShape[] = [
  'SQUARE',
  'ROUND',
  'RECTANGLE',
  'BAR',
];

export function OutletTablesPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [zones, setZones] = useState<TableZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [setupResult, setSetupResult] =
    useState<SetupDiningTablesResponse | null>(null);
  const [recentQr, setRecentQr] = useState<Record<string, RotateQrResponse>>(
    {},
  );
  const [setupBusy, setSetupBusy] = useState(false);
  const [rotateBusyTableId, setRotateBusyTableId] = useState<string | null>(
    null,
  );
  const [zoneName, setZoneName] = useState('');
  const [zoneDisplayOrder, setZoneDisplayOrder] = useState('0');
  const [zoneShape, setZoneShape] = useState<DiningTableShape>('SQUARE');
  const [defaultCapacity, setDefaultCapacity] = useState('2');
  const [rotateExistingQr, setRotateExistingQr] = useState(false);
  const [tableLines, setTableLines] = useState('');
  const [rotateReason, setRotateReason] = useState<Record<string, string>>({});
  const [rotateOpen, setRotateOpen] = useState<Record<string, boolean>>({});

  async function refreshTables(authToken: string) {
    const response = await getTables(authToken, outletId);
    setZones(response);
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
        const response = await getTables(authToken, outletId);
        if (!cancelled) {
          setZones(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load tables.',
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

    const parsedTables = parseTableLines(tableLines, {
      defaultCapacity,
      defaultShape: zoneShape,
    });
    if ('error' in parsedTables) {
      setActionError(parsedTables.error);
      setActionSuccess(null);
      return;
    }

    if (!zoneName.trim()) {
      setActionError('Zone name is required.');
      setActionSuccess(null);
      return;
    }

    const payload: SetupDiningTablesInput = {
      rotateExistingQr,
      zones: [
        {
          name: zoneName.trim(),
          displayOrder: Number(zoneDisplayOrder || '0'),
          active: true,
          tables: parsedTables.tables,
        },
      ],
    };

    setSetupBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await setupTables(session.accessToken, outletId, payload);
      setSetupResult(result);
      setZones(result.zones);
      setActionSuccess(
        `Saved ${result.qrCodes.length} table records for ${zoneName.trim()}.`,
      );
      setZoneName('');
      setZoneDisplayOrder('0');
      setDefaultCapacity('2');
      setZoneShape('SQUARE');
      setRotateExistingQr(false);
      setTableLines('');
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to save dining tables.',
      );
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleRotate(tableId: string) {
    if (!session?.accessToken) {
      return;
    }

    const reason = rotateReason[tableId]?.trim();
    if (!reason) {
      setActionError('A rotation reason is required before creating a new QR.');
      setActionSuccess(null);
      return;
    }

    setRotateBusyTableId(tableId);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await rotateTableQr(
        session.accessToken,
        outletId,
        tableId,
        {
          reason,
        },
      );
      setRecentQr((current) => ({ ...current, [tableId]: result }));
      await refreshTables(session.accessToken);
      setRotateOpen((current) => ({ ...current, [tableId]: false }));
      setRotateReason((current) => ({ ...current, [tableId]: '' }));
      setActionSuccess(`Generated a new QR for table ${result.publicCode}.`);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to rotate this QR code.',
      );
    } finally {
      setRotateBusyTableId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Tables and QR"
      subtitle="Bulk setup dining zones and tables, then rotate QR codes when a table link needs to be refreshed."
    >
      {outlet && <OutletHeader outlet={outlet} />}

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Dining layout</p>
            <h2 className="serif">Create or extend a dining zone</h2>
            <p>
              This setup form maps to the existing bulk setup endpoint. Add one
              zone at a time and paste one table per line.
            </p>
          </div>
        </div>

        <div className="detail-grid">
          <div className="field">
            <label htmlFor="zone-name">Zone name</label>
            <input
              id="zone-name"
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="Main floor"
              value={zoneName}
            />
          </div>
          <div className="field">
            <label htmlFor="zone-order">Display order</label>
            <input
              id="zone-order"
              inputMode="numeric"
              onChange={(event) => setZoneDisplayOrder(event.target.value)}
              placeholder="0"
              value={zoneDisplayOrder}
            />
          </div>
          <div className="field">
            <label htmlFor="default-capacity">Default capacity</label>
            <input
              id="default-capacity"
              inputMode="numeric"
              onChange={(event) => setDefaultCapacity(event.target.value)}
              placeholder="2"
              value={defaultCapacity}
            />
          </div>
          <div className="field">
            <label htmlFor="default-shape">Default shape</label>
            <select
              id="default-shape"
              onChange={(event) =>
                setZoneShape(event.target.value as DiningTableShape)
              }
              value={zoneShape}
            >
              {SHAPE_OPTIONS.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="table-lines">Tables</label>
          <textarea
            id="table-lines"
            onChange={(event) => setTableLines(event.target.value)}
            placeholder={
              'T01 | Table 1 | 2\nT02 | Window Table | 4 | ROUND\nVIP1 | VIP Booth | 6'
            }
            rows={8}
            value={tableLines}
          />
          <span className="helper-text">
            Format per line: `tableCode | display name | capacity | shape`. Only
            the first two values are required.
          </span>
        </div>

        <label className="checkbox-row">
          <input
            checked={rotateExistingQr}
            onChange={(event) => setRotateExistingQr(event.target.checked)}
            type="checkbox"
          />
          <span>
            Rotate existing active QR codes for tables in this setup batch.
          </span>
        </label>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={setupBusy}
            onClick={() => void handleSetupSubmit()}
            type="button"
          >
            {setupBusy ? 'Saving zone...' : 'Save dining zone'}
          </button>
        </div>

        {actionError && <div className="alert error">{actionError}</div>}
        {actionSuccess && <div className="alert success">{actionSuccess}</div>}

        {setupResult && (
          <div className="control-panel">
            <p className="eyebrow">Latest setup result</p>
            <p>{setupResult.note}</p>
            <div className="list-block">
              {setupResult.qrCodes.map((code) => (
                <article
                  className="info-card"
                  key={`${code.tableId}-${code.publicCode}`}
                >
                  <span className="metric-label">{code.tableCode}</span>
                  <span className="metric-value scope-card-value">
                    {code.generated ? 'Fresh QR generated' : 'Existing QR kept'}
                  </span>
                  <p className="metric-note">Public code {code.publicCode}</p>
                  {code.qrUrl && (
                    <p className="qr-link-block">
                      <a href={code.qrUrl} rel="noreferrer" target="_blank">
                        Open QR menu URL
                      </a>
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Active floor plan</p>
            <h2 className="serif">Zones, tables, and QR access</h2>
          </div>
        </div>

        {loading || outletBusy || busy ? (
          <p>Loading tables...</p>
        ) : outletError || error ? (
          <div className="alert error">{outletError ?? error}</div>
        ) : zones.length === 0 ? (
          <div className="empty-state">
            <strong>No dining zones configured yet.</strong>
            <p>
              Use the setup form above to create the first zone and generate QR
              menu links for your tables.
            </p>
          </div>
        ) : (
          <div className="list-block">
            {zones.map((zone) => (
              <article className="list-item" key={zone.id}>
                <div className="section-header">
                  <div>
                    <h3>{zone.name}</h3>
                    <p>{zone.tables.length} tables</p>
                  </div>
                  <div className="badge-row">
                    <span
                      className={zone.active ? 'badge success' : 'badge danger'}
                    >
                      {zone.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="detail-grid">
                  {zone.tables.map((table) => {
                    const activeQr = table.qrCodes[0] ?? null;
                    const latestRotated = recentQr[table.id];
                    const rotateOpenForTable = rotateOpen[table.id] ?? false;
                    const rotateReasonForTable = rotateReason[table.id] ?? '';
                    return (
                      <article className="info-card" key={table.id}>
                        <span className="metric-label">{table.tableCode}</span>
                        <span className="metric-value">
                          {table.displayName}
                        </span>
                        <p className="metric-note">
                          {table.capacity ?? '-'} pax • {table.shape} •{' '}
                          {table.status}
                        </p>
                        <p className="metric-note">
                          {activeQr
                            ? `Active QR ${activeQr.publicCode}`
                            : 'No active QR'}
                        </p>
                        {latestRotated?.qrUrl && (
                          <p className="qr-link-block">
                            <a
                              href={latestRotated.qrUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open latest QR menu URL
                            </a>
                          </p>
                        )}
                        <div className="action-row">
                          <button
                            className="secondary-button"
                            onClick={() =>
                              setRotateOpen((current) => ({
                                ...current,
                                [table.id]: !rotateOpenForTable,
                              }))
                            }
                            type="button"
                          >
                            {rotateOpenForTable ? 'Close' : 'Rotate QR'}
                          </button>
                        </div>

                        {rotateOpenForTable && (
                          <div className="control-panel">
                            <div className="field">
                              <label htmlFor={`rotate-reason-${table.id}`}>
                                Rotation reason
                              </label>
                              <textarea
                                id={`rotate-reason-${table.id}`}
                                onChange={(event) =>
                                  setRotateReason((current) => ({
                                    ...current,
                                    [table.id]: event.target.value,
                                  }))
                                }
                                placeholder="Rotate because the old QR was exposed, damaged, or replaced."
                                rows={3}
                                value={rotateReasonForTable}
                              />
                            </div>
                            <div className="action-row">
                              <button
                                className="primary-button"
                                disabled={
                                  rotateBusyTableId === table.id ||
                                  !rotateReasonForTable.trim()
                                }
                                onClick={() => void handleRotate(table.id)}
                                type="button"
                              >
                                {rotateBusyTableId === table.id
                                  ? 'Rotating...'
                                  : 'Generate new QR'}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </OutletPageLayout>
  );
}

function parseTableLines(
  input: string,
  defaults: {
    defaultCapacity: string;
    defaultShape: DiningTableShape;
  },
):
  | { tables: SetupDiningTablesInput['zones'][number]['tables'] }
  | { error: string } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { error: 'Add at least one table line before saving the zone.' };
  }

  const defaultCapacityNumber = Number(defaults.defaultCapacity || '2');
  if (!Number.isInteger(defaultCapacityNumber) || defaultCapacityNumber < 1) {
    return { error: 'Default capacity must be a whole number of at least 1.' };
  }

  const tables: SetupDiningTablesInput['zones'][number]['tables'] = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2) {
      return {
        error:
          'Each line needs at least a table code and display name separated by "|".',
      };
    }

    const [tableCode, displayName, capacityText, shapeText] = parts;
    if (!tableCode || !displayName) {
      return {
        error:
          'Every table line must include both a table code and a display name.',
      };
    }

    const capacity = capacityText
      ? Number(capacityText)
      : defaultCapacityNumber;
    if (!Number.isInteger(capacity) || capacity < 1) {
      return {
        error: `Capacity must be a whole number of at least 1 for ${tableCode}.`,
      };
    }

    const shape = (shapeText?.toUpperCase() ||
      defaults.defaultShape) as DiningTableShape;
    if (!SHAPE_OPTIONS.includes(shape)) {
      return {
        error: `Shape must be one of ${SHAPE_OPTIONS.join(', ')} for ${tableCode}.`,
      };
    }

    tables.push({
      tableCode,
      displayName,
      capacity,
      shape,
      status: 'AVAILABLE',
      active: true,
    });
  }

  return { tables };
}
