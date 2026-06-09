'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  clockInAttendance,
  clockOutAttendance,
  getAttendanceCurrent,
} from '@/lib/api';
import type {
  AttendanceCurrentResponse,
  AttendanceSessionEntry,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

export function OutletAttendancePage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [payload, setPayload] = useState<AttendanceCurrentResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoName, setPhotoName] = useState<string | null>(null);

  async function refresh(authToken: string) {
    const current = await getAttendanceCurrent(authToken, outletId);
    setPayload(current);
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
              : 'Failed to load attendance panel.',
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setDeviceLabel(window.navigator.userAgent.slice(0, 120));
  }, []);

  const currentSession = payload?.currentSession ?? null;
  const settings = payload?.settings ?? null;
  const recentSessions = payload?.recentSessions ?? [];

  const currentDuration = useMemo(() => {
    if (!currentSession) {
      return null;
    }
    const clockInAt = new Date(currentSession.clockInAt);
    if (Number.isNaN(clockInAt.getTime())) {
      return null;
    }
    const minutes = Math.max(
      1,
      Math.round((Date.now() - clockInAt.getTime()) / 60000),
    );
    return formatDuration(minutes);
  }, [currentSession]);

  async function handleSubmitClock(action: 'in' | 'out') {
    if (!session?.accessToken || !settings) {
      return;
    }
    setActionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (action === 'in') {
        await clockInAttendance(session.accessToken, outletId, {
          deviceLabel: deviceLabel.trim() || undefined,
          note: note.trim() || undefined,
          photoDataUrl,
        });
        setSuccess('Clock-in recorded.');
      } else {
        await clockOutAttendance(session.accessToken, outletId, {
          deviceLabel: deviceLabel.trim() || undefined,
          note: note.trim() || undefined,
          photoDataUrl,
        });
        setSuccess('Clock-out recorded.');
      }
      setNote('');
      setPhotoDataUrl(undefined);
      setPhotoName(null);
      await refresh(session.accessToken);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Attendance action failed.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePhotoChange(file: File | null) {
    if (!file) {
      setPhotoDataUrl(undefined);
      setPhotoName(null);
      return;
    }
    setPhotoName(file.name);
    const result = await readFileAsDataUrl(file);
    setPhotoDataUrl(result);
  }

  return (
    <OutletPageLayout
      title="Attendance"
      subtitle="Run clock-in, proof capture, and shift history from one outlet screen."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {outletBusy || busy ? (
        <section className="panel section-panel">
          <p className="supporting-copy">Loading attendance controls...</p>
        </section>
      ) : null}

      {outletError || error ? (
        <section className="panel section-panel">
          <div className="alert error">{outletError ?? error}</div>
        </section>
      ) : null}

      {success ? (
        <section className="panel section-panel">
          <div className="alert success">{success}</div>
        </section>
      ) : null}

      {!outletBusy && !busy && payload && settings ? (
        <section className="operations-layout support-station-layout">
          <aside className="panel section-panel support-control-rail">
            <article className="support-config-card">
              <div className="support-config-card__header">
                <div>
                  <p className="eyebrow">Shift station</p>
                  <h2 className="section-title">Clock control</h2>
                </div>
                <span
                  className={`status-pill ${
                    currentSession ? 'success' : 'neutral'
                  }`}
                >
                  {currentSession ? 'On shift' : 'Off shift'}
                </span>
              </div>
              <p className="supporting-copy">
                Attendance uses server time. Add a note or proof image when the
                shift needs a traceable handoff.
              </p>
              <div className="support-inline-meta">
                <span>{settings.allowManualClockIn ? 'Manual on' : 'Manual off'}</span>
                <span>
                  {settings.requirePhoto ? 'Photo required' : 'Photo optional'}
                </span>
                <span>{settings.maxShiftHours}h max shift</span>
              </div>
            </article>

            <article className="support-config-card">
              <div className="support-config-card__header">
                <div>
                  <p className="eyebrow">Current shift</p>
                  <h3>{currentSession ? 'Active session' : 'Ready to clock in'}</h3>
                </div>
              </div>
              {currentSession ? (
                <div className="support-note">
                  <strong>Started {formatDateTime(currentSession.clockInAt)}</strong>
                  <span>Live duration: {currentDuration ?? 'Calculating...'}</span>
                  {currentSession.clockInDeviceLabel ? (
                    <span>Device: {currentSession.clockInDeviceLabel}</span>
                  ) : null}
                </div>
              ) : (
                <div className="support-note">
                  Start your shift here when you are ready to work this outlet.
                </div>
              )}

              {!settings.allowManualClockIn && !currentSession ? (
                <div className="alert error">
                  Manual clock-in is disabled. Please ask a manager for help.
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="attendance-device">Device label</label>
                <input
                  id="attendance-device"
                  onChange={(event) => setDeviceLabel(event.target.value)}
                  value={deviceLabel}
                />
              </div>
              <div className="field">
                <label htmlFor="attendance-note">Shift note</label>
                <input
                  id="attendance-note"
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Opening shift, delivery late, etc."
                  value={note}
                />
              </div>
              <div className="field">
                <label htmlFor="attendance-photo">
                  Photo proof {settings.requirePhoto ? '(required)' : '(optional)'}
                </label>
                <input
                  accept="image/*"
                  capture="user"
                  id="attendance-photo"
                  onChange={(event) =>
                    void handlePhotoChange(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
                <p className="supporting-copy">
                  {photoName ? `Selected: ${photoName}` : 'No photo selected yet.'}
                </p>
              </div>
              {photoDataUrl ? (
                <img
                  alt="Attendance proof preview"
                  src={photoDataUrl}
                  style={{
                    maxWidth: '100%',
                    borderRadius: 18,
                    border: '1px solid rgba(120, 87, 52, 0.18)',
                  }}
                />
              ) : null}
              <div className="support-card__actions">
                {!currentSession ? (
                  <button
                    className="primary-button"
                    disabled={
                      actionBusy ||
                      !settings.allowManualClockIn ||
                      (settings.requirePhoto && !photoDataUrl)
                    }
                    onClick={() => void handleSubmitClock('in')}
                    type="button"
                  >
                    {actionBusy ? 'Saving...' : 'Clock in'}
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={actionBusy || (settings.requirePhoto && !photoDataUrl)}
                    onClick={() => void handleSubmitClock('out')}
                    type="button"
                  >
                    {actionBusy ? 'Saving...' : 'Clock out'}
                  </button>
                )}
              </div>
            </article>
          </aside>

          <div className="support-board-panel">
            <section className="support-summary-grid">
              <article className="support-card">
                <div className="support-card__header">
                  <div>
                    <p className="eyebrow">Status</p>
                    <h3>{currentSession ? 'Clocked in' : 'Off shift'}</h3>
                  </div>
                  <span className="status-pill neutral">Live</span>
                </div>
                <p className="supporting-copy">
                  Current attendance state for this outlet session.
                </p>
              </article>
              <article className="support-card">
                <div className="support-card__header">
                  <div>
                    <p className="eyebrow">Proof</p>
                    <h3>{settings.requirePhoto ? 'Required' : 'Optional'}</h3>
                  </div>
                  <span className="status-pill neutral">Policy</span>
                </div>
                <p className="supporting-copy">
                  Whether photo capture is needed for this outlet.
                </p>
              </article>
              <article className="support-card">
                <div className="support-card__header">
                  <div>
                    <p className="eyebrow">Max shift</p>
                    <h3>{settings.maxShiftHours} hours</h3>
                  </div>
                  <span className="status-pill warning">Review limit</span>
                </div>
                <p className="supporting-copy">
                  Threshold before a shift should be reviewed.
                </p>
              </article>
              <article className="support-card">
                <div className="support-card__header">
                  <div>
                    <p className="eyebrow">Recent sessions</p>
                    <h3>{recentSessions.length}</h3>
                  </div>
                  <span className="status-pill neutral">History</span>
                </div>
                <p className="supporting-copy">
                  Recent clock-in and clock-out records in view.
                </p>
              </article>
            </section>

            <article className="panel section-panel support-card">
              <div className="support-card__header">
                <div>
                  <p className="eyebrow">Shift timeline</p>
                  <h2 className="section-title">Recent sessions</h2>
                </div>
                <span className="status-pill neutral">{recentSessions.length} entries</span>
              </div>
              {recentSessions.length === 0 ? (
                <div className="empty-state">
                  <strong>No attendance records yet.</strong>
                </div>
              ) : (
                <div className="list-block">
                  {recentSessions.map((entry) => (
                    <article className="list-item" key={entry.id}>
                      <div className="support-list-card__header">
                        <div>
                          <h3>{formatDateTime(entry.clockInAt)}</h3>
                          <p className="supporting-copy">
                            {entry.status === 'CLOCKED_IN'
                              ? 'Open shift'
                              : 'Completed shift'}
                          </p>
                        </div>
                        <div className="tag-row">
                          <span className={`status-pill ${statusTone(entry.status)}`}>
                            {formatEnum(entry.status)}
                          </span>
                          <span
                            className={`status-pill ${approvalTone(entry.approvalStatus)}`}
                          >
                            {formatEnum(entry.approvalStatus)}
                          </span>
                        </div>
                      </div>
                      <div className="support-inline-meta">
                        <span>Worked {formatDuration(entry.workedMinutes)}</span>
                        <span>
                          Clock-out {formatDateTime(entry.clockOutAt) || 'Still on shift'}
                        </span>
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
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>
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

function statusTone(status: AttendanceSessionEntry['status']) {
  return status === 'CLOCKED_OUT' ? 'success' : 'warning';
}

function approvalTone(status: AttendanceSessionEntry['approvalStatus']) {
  if (status === 'APPROVED') {
    return 'success';
  }
  if (status === 'FLAGGED') {
    return 'warning';
  }
  return 'neutral';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read the selected photo.'));
    };
    reader.onerror = () =>
      reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}
