'use client';

import { useEffect, useMemo, useState } from 'react';
import { getOutletAuditLogs } from '@/lib/api';
import type { OutletAuditEntry } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const limitOptions = [25, 50, 100];

export function OutletAuditPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [entries, setEntries] = useState<OutletAuditEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [actionTypeFilter, setActionTypeFilter] = useState('');

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      try {
        const result = await getOutletAuditLogs(authToken, outletId, {
          limit,
          actionType: actionTypeFilter.trim() || undefined,
        });
        if (!cancelled) {
          setEntries(result.entries);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load outlet audit logs.',
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
  }, [actionTypeFilter, limit, outletId, session]);

  const actionTypes = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.actionType))).sort(),
    [entries],
  );

  return (
    <OutletPageLayout
      title="Audit trail"
      subtitle="Review who changed menus, staff access, payment controls, QR codes, and printing actions for this outlet."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {loading || outletBusy || busy ? (
        <section className="section-panel">
          <p>Loading outlet audit activity...</p>
        </section>
      ) : null}

      {outletError || error ? (
        <section className="section-panel">
          <div className="alert error">{outletError ?? error}</div>
        </section>
      ) : null}

      {!loading && !outletBusy && !busy ? (
        <>
          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Filters</p>
                <h2 className="serif">Activity scope</h2>
                <p>
                  Narrow the feed to a specific action type or expand the history
                  window for investigations and support reviews.
                </p>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="audit-limit">Entries</label>
                <select
                  id="audit-limit"
                  onChange={(event) => setLimit(Number(event.target.value))}
                  value={limit}
                >
                  {limitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="audit-action-type">Action type</label>
                <input
                  id="audit-action-type"
                  list="audit-action-types"
                  onChange={(event) => setActionTypeFilter(event.target.value)}
                  placeholder="Leave blank to show all actions"
                  value={actionTypeFilter}
                />
                <datalist id="audit-action-types">
                  {actionTypes.map((actionType) => (
                    <option key={actionType} value={actionType} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Activity feed</p>
                <h2 className="serif">Recent audited actions</h2>
                <p>
                  This feed is backed directly by the backend audit log records
                  already created by menu, payment, table, printing, and staff
                  workflows.
                </p>
              </div>
            </div>

            <div className="list-block">
              {entries.length === 0 ? (
                <div className="empty-state">
                  <strong>No audit records matched this filter.</strong>
                </div>
              ) : (
                entries.map((entry) => (
                  <article className="list-item" key={entry.id}>
                    <div className="section-header">
                      <div>
                        <h3>{entry.actionType}</h3>
                        <p>
                          {entry.actor?.fullName ?? 'System'} |{' '}
                          {entry.actor?.email ?? 'Automated action'}
                        </p>
                      </div>
                      <div className="badge-row">
                        <span className="badge">{entry.entityType}</span>
                        <span className="tag">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Reason</span>
                        <span className="metric-value scope-card-value">
                          {entry.reason ?? 'No reason supplied'}
                        </span>
                        <p className="metric-note">
                          Entity {entry.entityId ?? 'n/a'}
                        </p>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Request trace</span>
                        <span className="metric-value scope-card-value">
                          {entry.requestId ?? 'No request id'}
                        </span>
                        <p className="metric-note">
                          IP {entry.ipAddress ?? 'Unavailable'}
                        </p>
                      </article>
                    </div>

                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Before</span>
                        <pre className="json-block">
                          {prettyJson(entry.before)}
                        </pre>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">After</span>
                        <pre className="json-block">
                          {prettyJson(entry.after)}
                        </pre>
                      </article>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </OutletPageLayout>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
