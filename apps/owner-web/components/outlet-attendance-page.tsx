'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  adjustAttendanceSession,
  approveAttendanceSession,
  getAttendanceSessions,
  getAttendanceSettings,
  updateAttendanceSettings,
} from '@/lib/api';
import type {
  AttendanceSessionEntry,
  AttendanceSettingsResponse,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

const approvalFilters = ['ALL', 'PENDING', 'FLAGGED', 'APPROVED', 'ADJUSTED'] as const;
type ApprovalFilter = (typeof approvalFilters)[number];

export function OutletAttendancePage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [settings, setSettings] = useState<AttendanceSettingsResponse | null>(null);
  const [sessions, setSessions] = useState<AttendanceSessionEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [adjustBusyId, setAdjustBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalFilter>('ALL');
  const [settingsForm, setSettingsForm] = useState({
    requirePhoto: false,
    allowManualClockIn: true,
    maxShiftHours: 16,
    autoFlagLateClockOut: true,
    timezone: 'Asia/Singapore',
    reason: 'Updated attendance policy.',
  });
  const [adjustReasonById, setAdjustReasonById] = useState<Record<string, string>>(
    {},
  );
  const [adjustInById, setAdjustInById] = useState<Record<string, string>>({});
  const [adjustOutById, setAdjustOutById] = useState<Record<string, string>>({});
  const [adjustNoteById, setAdjustNoteById] = useState<Record<string, string>>({});

  async function refresh(authToken: string) {
    const [settingsResponse, sessionsResponse] = await Promise.all([
      getAttendanceSettings(authToken, outletId),
      getAttendanceSessions(authToken, outletId, { limit: 50 }),
    ]);
    setSettings(settingsResponse);
    setSessions(sessionsResponse.sessions);
    setSettingsForm({
      requirePhoto: settingsResponse.requirePhoto,
      allowManualClockIn: settingsResponse.allowManualClockIn,
      maxShiftHours: settingsResponse.maxShiftHours,
      autoFlagLateClockOut: settingsResponse.autoFlagLateClockOut,
      timezone: settingsResponse.timezone,
      reason: 'Updated attendance policy.',
    });
    setAdjustReasonById(
      Object.fromEntries(
        sessionsResponse.sessions.map((entry) => [
          entry.id,
          entry.reviewReason ?? 'Adjusted after manager review.',
        ]),
      ),
    );
    setAdjustInById(
      Object.fromEntries(
        sessionsResponse.sessions.map((entry) => [
          entry.id,
          toDateTimeLocalValue(entry.clockInAt),
        ]),
      ),
    );
    setAdjustOutById(
      Object.fromEntries(
        sessionsResponse.sessions.map((entry) => [
          entry.id,
          toDateTimeLocalValue(entry.clockOutAt),
        ]),
      ),
    );
    setAdjustNoteById(
      Object.fromEntries(
        sessionsResponse.sessions.map((entry) => [
          entry.id,
          entry.clockOutNote ?? entry.clockInNote ?? '',
        ]),
      ),
    );
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
        await refresh(authToken);
        if (!cancelled) {
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load attendance data.',
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

  const filteredSessions = useMemo(() => {
    if (filter === 'ALL') {
      return sessions;
    }
    return sessions.filter((entry) => entry.approvalStatus === filter);
  }, [filter, sessions]);

  const summary = useMemo(
    () => ({
      total: sessions.length,
      open: sessions.filter((entry) => entry.status === 'CLOCKED_IN').length,
      pending: sessions.filter((entry) => entry.approvalStatus === 'PENDING')
        .length,
      flagged: sessions.filter((entry) => entry.approvalStatus === 'FLAGGED')
        .length,
      approved: sessions.filter((entry) => entry.approvalStatus === 'APPROVED')
        .length,
    }),
    [sessions],
  );

  async function handleSaveSettings() {
    if (!session?.accessToken) {
      return;
    }
    setSaveBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await updateAttendanceSettings(
        session.accessToken,
        outletId,
        settingsForm,
      );
      setSettings(updated);
      setActionSuccess('Attendance settings updated.');
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to update attendance settings.',
      );
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleApprove(sessionEntry: AttendanceSessionEntry) {
    if (!session?.accessToken) {
      return;
    }
    setApprovalBusyId(sessionEntry.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await approveAttendanceSession(session.accessToken, outletId, sessionEntry.id, {
        reason: `Approved ${sessionEntry.user.fullName}'s attendance session.`,
      });
      await refresh(session.accessToken);
      setActionSuccess(`${sessionEntry.user.fullName}'s session is approved.`);
    } catch (approveError) {
      setActionError(
        approveError instanceof Error
          ? approveError.message
          : 'Failed to approve attendance session.',
      );
    } finally {
      setApprovalBusyId(null);
    }
  }

  async function handleAdjust(sessionEntry: AttendanceSessionEntry) {
    if (!session?.accessToken) {
      return;
    }
    const reason = adjustReasonById[sessionEntry.id]?.trim() ?? '';
    if (reason.length < 3) {
      setActionError('Add a short manager reason before adjusting a session.');
      return;
    }

    setAdjustBusyId(sessionEntry.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await adjustAttendanceSession(session.accessToken, outletId, sessionEntry.id, {
        clockInAt: fromDateTimeLocalValue(adjustInById[sessionEntry.id]),
        clockOutAt: fromDateTimeLocalValue(adjustOutById[sessionEntry.id]),
        note: adjustNoteById[sessionEntry.id]?.trim() || undefined,
        reason,
      });
      await refresh(session.accessToken);
      setActionSuccess(`${sessionEntry.user.fullName}'s session was adjusted.`);
    } catch (adjustError) {
      setActionError(
        adjustError instanceof Error
          ? adjustError.message
          : 'Failed to adjust attendance session.',
      );
    } finally {
      setAdjustBusyId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Attendance"
      subtitle="Set outlet attendance policy, review shift records, approve completed sessions, and fix exceptions."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {loading || outletBusy || busy ? (
        <section className="section-panel">
          <p>Loading attendance settings and shift records...</p>
        </section>
      ) : null}

      {outletError || error ? (
        <section className="section-panel">
          <div className="alert error">{outletError ?? error}</div>
        </section>
      ) : null}

      {actionError ? (
        <section className="section-panel">
          <div className="alert error">{actionError}</div>
        </section>
      ) : null}

      {actionSuccess ? (
        <section className="section-panel">
          <div className="alert success">{actionSuccess}</div>
        </section>
      ) : null}

      {!loading && !outletBusy && !busy && settings ? (
        <>
          <section className="metric-board">
            <article className="info-card">
              <span className="metric-label">Total sessions</span>
              <strong className="metric-value">{summary.total}</strong>
            </article>
            <article className="info-card">
              <span className="metric-label">Currently clocked in</span>
              <strong className="metric-value">{summary.open}</strong>
            </article>
            <article className="info-card">
              <span className="metric-label">Pending review</span>
              <strong className="metric-value">{summary.pending}</strong>
            </article>
            <article className="info-card">
              <span className="metric-label">Flagged</span>
              <strong className="metric-value">{summary.flagged}</strong>
            </article>
            <article className="info-card">
              <span className="metric-label">Approved</span>
              <strong className="metric-value">{summary.approved}</strong>
            </article>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Policy</p>
                <h2 className="serif">Attendance settings</h2>
                <p>
                  Control whether shifts require photo proof, whether manual
                  clock-in is allowed, and when long shifts should be flagged.
                </p>
              </div>
            </div>

            <div className="form-grid">
              <label className="checkbox-row">
                <input
                  checked={settingsForm.requirePhoto}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      requirePhoto: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Require photo proof for clock-in and clock-out
              </label>
              <label className="checkbox-row">
                <input
                  checked={settingsForm.allowManualClockIn}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      allowManualClockIn: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Allow staff to clock in manually from the web app
              </label>
              <label className="checkbox-row">
                <input
                  checked={settingsForm.autoFlagLateClockOut}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      autoFlagLateClockOut: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Auto-flag shifts longer than the configured maximum
              </label>
              <div className="field">
                <label htmlFor="attendance-max-shift">Max shift hours</label>
                <input
                  id="attendance-max-shift"
                  min={1}
                  max={24}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      maxShiftHours: Number(event.target.value) || 1,
                    }))
                  }
                  type="number"
                  value={settingsForm.maxShiftHours}
                />
              </div>
              <div className="field">
                <label htmlFor="attendance-timezone">Timezone</label>
                <input
                  id="attendance-timezone"
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  value={settingsForm.timezone}
                />
              </div>
              <div className="field">
                <label htmlFor="attendance-reason">Change reason</label>
                <input
                  id="attendance-reason"
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  value={settingsForm.reason}
                />
              </div>
            </div>

            <div className="action-row">
              <button
                className="primary-button"
                disabled={saveBusy || settingsForm.reason.trim().length < 3}
                onClick={() => void handleSaveSettings()}
                type="button"
              >
                {saveBusy ? 'Saving...' : 'Save attendance settings'}
              </button>
              <p className="metric-note">
                Version {settings.version} updated {formatDateTime(settings.updatedAt)}.
              </p>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Review queue</p>
                <h2 className="serif">Attendance sessions</h2>
                <p>
                  Review recent shift records, approve normal clock-outs, and
                  adjust timings when staff forget to clock out.
                </p>
              </div>
              <div className="field" style={{ minWidth: 220 }}>
                <label htmlFor="attendance-filter">Filter</label>
                <select
                  id="attendance-filter"
                  onChange={(event) =>
                    setFilter(event.target.value as ApprovalFilter)
                  }
                  value={filter}
                >
                  {approvalFilters.map((option) => (
                    <option key={option} value={option}>
                      {option === 'ALL' ? 'All review states' : formatEnum(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="list-block">
              {filteredSessions.length === 0 ? (
                <div className="empty-state">
                  <strong>No attendance sessions match this filter yet.</strong>
                </div>
              ) : (
                filteredSessions.map((entry) => (
                  <article className="list-item" key={entry.id}>
                    <div className="section-header">
                      <div>
                        <h3>{entry.user.fullName}</h3>
                        <p>{entry.user.email}</p>
                      </div>
                      <div className="badge-row">
                        <span className={`badge ${statusBadgeTone(entry.status)}`}>
                          {formatEnum(entry.status)}
                        </span>
                        <span
                          className={`badge ${approvalBadgeTone(entry.approvalStatus)}`}
                        >
                          {formatEnum(entry.approvalStatus)}
                        </span>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Clock-in</span>
                        <span className="metric-value scope-card-value">
                          {formatDateTime(entry.clockInAt)}
                        </span>
                        <p className="metric-note">
                          {entry.clockInDeviceLabel || 'Device not provided'}
                        </p>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Clock-out</span>
                        <span className="metric-value scope-card-value">
                          {formatDateTime(entry.clockOutAt) || 'Still clocked in'}
                        </span>
                        <p className="metric-note">
                          {entry.clockOutDeviceLabel || 'Awaiting clock-out'}
                        </p>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Worked</span>
                        <span className="metric-value scope-card-value">
                          {formatDuration(entry.workedMinutes)}
                        </span>
                        <p className="metric-note">
                          {entry.approvedBy
                            ? `Approved by ${entry.approvedBy.fullName}`
                            : 'Awaiting manager review'}
                        </p>
                      </article>
                    </div>

                    {entry.reviewReason ? (
                      <div className="alert error">{entry.reviewReason}</div>
                    ) : null}

                    {entry.photos.length > 0 ? (
                      <div className="tag-row">
                        {entry.photos.map((photo) => (
                          <a
                            className="tag"
                            href={photo.photoUrl}
                            key={photo.id}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatEnum(photo.type)} photo
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor={`adjust-in-${entry.id}`}>Adjust clock-in</label>
                        <input
                          id={`adjust-in-${entry.id}`}
                          onChange={(event) =>
                            setAdjustInById((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          type="datetime-local"
                          value={adjustInById[entry.id] ?? ''}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`adjust-out-${entry.id}`}>Adjust clock-out</label>
                        <input
                          id={`adjust-out-${entry.id}`}
                          onChange={(event) =>
                            setAdjustOutById((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          type="datetime-local"
                          value={adjustOutById[entry.id] ?? ''}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`adjust-note-${entry.id}`}>Note</label>
                        <input
                          id={`adjust-note-${entry.id}`}
                          onChange={(event) =>
                            setAdjustNoteById((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          value={adjustNoteById[entry.id] ?? ''}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`adjust-reason-${entry.id}`}>Manager reason</label>
                        <input
                          id={`adjust-reason-${entry.id}`}
                          onChange={(event) =>
                            setAdjustReasonById((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          value={adjustReasonById[entry.id] ?? ''}
                        />
                      </div>
                    </div>

                    <div className="action-row">
                      {entry.status === 'CLOCKED_OUT' &&
                      entry.approvalStatus !== 'APPROVED' ? (
                        <button
                          className="primary-button"
                          disabled={approvalBusyId === entry.id}
                          onClick={() => void handleApprove(entry)}
                          type="button"
                        >
                          {approvalBusyId === entry.id ? 'Approving...' : 'Approve'}
                        </button>
                      ) : null}
                      <button
                        className="secondary-button"
                        disabled={adjustBusyId === entry.id}
                        onClick={() => void handleAdjust(entry)}
                        type="button"
                      >
                        {adjustBusyId === entry.id ? 'Saving...' : 'Adjust session'}
                      </button>
                    </div>

                    {entry.adjustments.length > 0 ? (
                      <div className="sub-panel">
                        <strong>Recent adjustments</strong>
                        <div className="stack-list">
                          {entry.adjustments.map((adjustment) => (
                            <div className="stack-row" key={adjustment.id}>
                              <span>{adjustment.reason}</span>
                              <strong>{formatDateTime(adjustment.createdAt)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
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

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes < 1) {
    return 'In progress';
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset();
  const shifted = new Date(date.getTime() - offset * 60000);
  return shifted.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function statusBadgeTone(status: AttendanceSessionEntry['status']) {
  return status === 'CLOCKED_IN' ? 'warn' : 'success';
}

function approvalBadgeTone(status: AttendanceSessionEntry['approvalStatus']) {
  if (status === 'APPROVED') {
    return 'success';
  }
  if (status === 'FLAGGED') {
    return 'warn';
  }
  return 'info';
}
