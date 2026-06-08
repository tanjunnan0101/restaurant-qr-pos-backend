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
      subtitle="Clock in and out with server-recorded timestamps, optional photo proof, and a quick view of your recent shift history."
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
        <>
          <section className="metric-board">
            <article className="panel metric-card">
              <span className="metric-label">Manual clock-in</span>
              <strong className="metric-value">
                {settings.allowManualClockIn ? 'Enabled' : 'Disabled'}
              </strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Photo proof</span>
              <strong className="metric-value">
                {settings.requirePhoto ? 'Required' : 'Optional'}
              </strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Max shift hours</span>
              <strong className="metric-value">{settings.maxShiftHours}</strong>
            </article>
            <article className="panel metric-card">
              <span className="metric-label">Current status</span>
              <strong className="metric-value">
                {currentSession ? 'Clocked in' : 'Off shift'}
              </strong>
            </article>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Shift control</p>
                <h2 className="section-title serif">Clock in or out</h2>
                <p className="supporting-copy">
                  Attendance is recorded with server timestamps. Add an optional
                  note or photo to support exception review later.
                </p>
              </div>
            </div>

            {currentSession ? (
              <div className="sub-panel">
                <strong>Current session</strong>
                <p className="supporting-copy">
                  Started {formatDateTime(currentSession.clockInAt)}.
                </p>
                <p className="supporting-copy">
                  Time on shift: {currentDuration ?? 'Calculating...'}
                </p>
                {currentSession.clockInDeviceLabel ? (
                  <p className="supporting-copy">
                    Device: {currentSession.clockInDeviceLabel}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="sub-panel">
                <strong>No active session</strong>
                <p className="supporting-copy">
                  Start your shift here when you are ready to work this outlet.
                </p>
              </div>
            )}

            {!settings.allowManualClockIn && !currentSession ? (
              <div className="alert error">
                Manual clock-in is disabled. Please ask a manager for help.
              </div>
            ) : null}

            <div className="form-grid">
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
            </div>

            {photoDataUrl ? (
              <img
                alt="Attendance proof preview"
                src={photoDataUrl}
                style={{
                  maxWidth: 240,
                  borderRadius: 16,
                  border: '1px solid rgba(120, 87, 52, 0.18)',
                }}
              />
            ) : null}

            <div className="action-row">
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
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">History</p>
                <h2 className="section-title serif">Recent sessions</h2>
                <p className="supporting-copy">
                  Your latest attendance records stay visible here so you can
                  confirm manager approvals and any flagged shifts.
                </p>
              </div>
            </div>

            <div className="list-block">
              {recentSessions.length === 0 ? (
                <div className="empty-state">
                  <strong>No attendance records yet.</strong>
                </div>
              ) : (
                recentSessions.map((entry) => (
                  <article className="list-item" key={entry.id}>
                    <div className="section-header">
                      <div>
                        <h3>{formatDateTime(entry.clockInAt)}</h3>
                        <p>{entry.status === 'CLOCKED_IN' ? 'Open shift' : 'Completed shift'}</p>
                      </div>
                      <div className="badge-row">
                        <span className={`badge ${statusTone(entry.status)}`}>
                          {formatEnum(entry.status)}
                        </span>
                        <span className={`badge ${approvalTone(entry.approvalStatus)}`}>
                          {formatEnum(entry.approvalStatus)}
                        </span>
                      </div>
                    </div>
                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Worked</span>
                        <span className="metric-value scope-card-value">
                          {formatDuration(entry.workedMinutes)}
                        </span>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Clock-out</span>
                        <span className="metric-value scope-card-value">
                          {formatDateTime(entry.clockOutAt) || 'Still on shift'}
                        </span>
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

function statusTone(status: AttendanceSessionEntry['status']) {
  return status === 'CLOCKED_OUT' ? 'success' : 'warn';
}

function approvalTone(status: AttendanceSessionEntry['approvalStatus']) {
  if (status === 'APPROVED') {
    return 'success';
  }
  if (status === 'FLAGGED') {
    return 'warn';
  }
  return 'info';
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
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}
