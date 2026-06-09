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

const PHOTO_REQUIRED_MESSAGE =
  'A clock photo is required on this station before continuing.';

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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState('Front counter iPad');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function refresh(authToken: string, nextUserId?: string | null) {
    const current = await getAttendanceCurrent(
      authToken,
      outletId,
      nextUserId ?? selectedUserId ?? undefined,
    );
    setPayload(current);
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const platformLabel = /iPad|iPhone|Macintosh/.test(window.navigator.userAgent)
      ? 'Front counter iPad'
      : 'Staff station';
    setDeviceLabel(platformLabel);
  }, []);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      try {
        const current = await getAttendanceCurrent(
          authToken,
          outletId,
          selectedUserId ?? undefined,
        );
        if (!cancelled) {
          setPayload(current);
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
  }, [outletId, selectedUserId, session]);

  const selectedUser =
    payload?.selectedUser ??
    (session
      ? {
          id: session.user.id,
          fullName: session.user.fullName,
          email: session.user.email,
          roleKey: 'STAFF',
          roleName: 'Staff',
        }
      : null);
  const currentSession = payload?.currentSession ?? null;
  const recentSessions = payload?.recentSessions ?? [];
  const staffRoster = payload?.staffRoster ?? [];
  const settings = payload?.settings;

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
    if (!session?.accessToken || !selectedUser) {
      return;
    }
    if (!photoDataUrl) {
      setError(PHOTO_REQUIRED_MESSAGE);
      return;
    }
    setActionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (action === 'in') {
        await clockInAttendance(session.accessToken, outletId, {
          userId: selectedUser.id,
          deviceLabel: deviceLabel.trim() || undefined,
          note: note.trim() || undefined,
          photoDataUrl,
        });
        setSuccess(`${selectedUser.fullName} clocked in.`);
      } else {
        await clockOutAttendance(session.accessToken, outletId, {
          userId: selectedUser.id,
          deviceLabel: deviceLabel.trim() || undefined,
          note: note.trim() || undefined,
          photoDataUrl,
        });
        setSuccess(`${selectedUser.fullName} clocked out.`);
      }
      setNote('');
      setPhotoDataUrl(undefined);
      setPhotoName(null);
      await refresh(session.accessToken, selectedUser.id);
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

    setPhotoBusy(true);
    setError(null);
    setPhotoName(file.name);
    try {
      const result = await compressImageForAttendance(file);
      setPhotoDataUrl(result);
    } catch (photoError) {
      setPhotoDataUrl(undefined);
      setPhotoName(null);
      setError(
        photoError instanceof Error
          ? photoError.message
          : 'Could not prepare the photo.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  const selectedRosterEntry =
    staffRoster.find((entry) => entry.id === selectedUser?.id) ?? null;

  return (
    <OutletPageLayout
      title="Attendance"
      subtitle="Shared-device clocking with employee selection and mandatory photo proof."
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

      {!outletBusy && !busy && payload && selectedUser && settings ? (
        <section className="operations-stack attendance-station">
          <section className="panel section-panel attendance-hero">
            <div className="attendance-hero__copy">
              <p className="eyebrow">Shared shift station</p>
              <h2 className="section-title">Who is clocking?</h2>
              <p className="supporting-copy">
                Staff tap their own name, take a photo on the iPad, and then
                start or end the shift from this station.
              </p>
            </div>
            <div className="attendance-hero__meta">
              <span className="status-pill warning">Photo required</span>
              <span className="status-pill neutral">{deviceLabel}</span>
            </div>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Staff roster</p>
                <h2 className="section-title">Select employee</h2>
              </div>
              <span className="supporting-copy">
                {staffRoster.length} active staff linked to this outlet
              </span>
            </div>
            <div className="attendance-roster-grid">
              {staffRoster.map((entry) => {
                const active = entry.id === selectedUser.id;
                return (
                  <button
                    className={
                      active
                        ? 'attendance-roster-card active'
                        : 'attendance-roster-card'
                    }
                    key={entry.id}
                    onClick={() => {
                      setSelectedUserId(entry.id);
                      setPhotoDataUrl(undefined);
                      setPhotoName(null);
                      setSuccess(null);
                      setError(null);
                    }}
                    type="button"
                  >
                    <div>
                      <strong>{entry.fullName}</strong>
                      <p>{entry.roleName}</p>
                      <small>{entry.email}</small>
                    </div>
                    <span
                      className={`status-pill ${
                        entry.activeSession ? 'warning' : 'success'
                      }`}
                    >
                      {entry.activeSession ? 'On shift' : 'Ready'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="attendance-station-grid">
            <section className="panel section-panel attendance-capture-card">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Clock action</p>
                  <h2 className="section-title">{selectedUser.fullName}</h2>
                  <p className="supporting-copy">
                    {selectedUser.roleName} | {selectedUser.email}
                  </p>
                </div>
                <span
                  className={`status-pill ${
                    currentSession ? 'warning' : 'neutral'
                  }`}
                >
                  {currentSession ? 'On shift' : 'Off shift'}
                </span>
              </div>

              <div className="attendance-kiosk-grid">
                <div className="field">
                  <label htmlFor="attendance-device">Station label</label>
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
                    placeholder="Opening, handover, closing, etc."
                    value={note}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="attendance-photo">Take employee photo</label>
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
                  Use the front camera on the iPad. The image is compressed
                  before upload so the shift can be saved reliably.
                </p>
              </div>

              <div className="attendance-photo-proof">
                {photoDataUrl ? (
                  <img
                    alt="Attendance proof preview"
                    className="attendance-photo-preview"
                    src={photoDataUrl}
                  />
                ) : (
                  <div className="empty-state attendance-photo-empty">
                    <strong>No photo captured yet</strong>
                    <p className="supporting-copy">
                      A selfie is required before clocking in or out.
                    </p>
                  </div>
                )}
                <div className="support-inline-meta">
                  <span>{photoName ?? 'Waiting for camera capture'}</span>
                  <span>{photoBusy ? 'Preparing image...' : 'Ready for upload'}</span>
                </div>
              </div>

              <div className="attendance-action-row">
                {!currentSession ? (
                  <button
                    className="primary-button"
                    disabled={actionBusy || photoBusy || !photoDataUrl}
                    onClick={() => void handleSubmitClock('in')}
                    type="button"
                  >
                    {actionBusy ? 'Saving...' : `Clock in ${selectedUser.fullName}`}
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={actionBusy || photoBusy || !photoDataUrl}
                    onClick={() => void handleSubmitClock('out')}
                    type="button"
                  >
                    {actionBusy ? 'Saving...' : `Clock out ${selectedUser.fullName}`}
                  </button>
                )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    setPhotoDataUrl(undefined);
                    setPhotoName(null);
                    setError(null);
                  }}
                  type="button"
                >
                  Retake photo
                </button>
              </div>
            </section>

            <aside className="panel section-panel attendance-status-card">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Shift status</p>
                  <h2 className="section-title">
                    {currentSession ? 'Currently clocked in' : 'Ready to start'}
                  </h2>
                </div>
                <span className="status-pill neutral">
                  {settings.maxShiftHours}h max shift
                </span>
              </div>

              {currentSession ? (
                <div className="soft-note">
                  <strong>Started {formatDateTime(currentSession.clockInAt)}</strong>
                  <p className="supporting-copy">
                    Live duration: {currentDuration ?? 'Calculating...'}
                  </p>
                  {currentSession.clockInDeviceLabel ? (
                    <p className="supporting-copy">
                      Device: {currentSession.clockInDeviceLabel}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="soft-note">
                  <strong>{selectedUser.fullName} is off shift</strong>
                  <p className="supporting-copy">
                    Select the employee, take the proof photo, then start the
                    shift from this station.
                  </p>
                </div>
              )}

              <div className="detail-overview-grid floor-summary-grid">
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Role</span>
                  <strong className="scope-card-value">{selectedUser.roleName}</strong>
                </article>
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Recent sessions</span>
                  <strong className="scope-card-value">{recentSessions.length}</strong>
                </article>
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Photo policy</span>
                  <strong className="scope-card-value">Required</strong>
                </article>
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Outlet policy</span>
                  <strong className="scope-card-value">
                    {settings.allowManualClockIn ? 'Manual on' : 'Manual off'}
                  </strong>
                </article>
              </div>

              {selectedRosterEntry?.activeSession ? (
                <div className="support-note">
                  <strong>Open shift detected</strong>
                  <span>
                    Clocked in {formatDateTime(selectedRosterEntry.activeSession.clockInAt)}
                  </span>
                </div>
              ) : null}
            </aside>
          </section>

          <section className="panel section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Shift timeline</p>
                <h2 className="section-title">Recent sessions</h2>
              </div>
              <span className="status-pill neutral">
                {recentSessions.length} entries
              </span>
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
          </section>
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

async function compressImageForAttendance(file: File) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  const maxEdge = 960;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare the photo for upload.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > 95000 && quality > 0.38) {
    quality -= 0.08;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > 95000) {
    throw new Error(
      'The captured photo is still too large. Move closer and retake a tighter shot.',
    );
  }

  return output;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read the selected photo.'));
    image.src = src;
  });
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
