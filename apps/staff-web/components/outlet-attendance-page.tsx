'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cancelAttendanceSchedule,
  clockInAttendance,
  clockOutAttendance,
  createAttendanceSchedule,
  getAttendanceCurrent,
} from '@/lib/api';
import type {
  AttendanceCurrentResponse,
  AttendanceShiftEntry,
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
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [scheduleUserId, setScheduleUserId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(getDefaultScheduleDate());
  const [scheduleStartTime, setScheduleStartTime] = useState('09:00');
  const [scheduleEndTime, setScheduleEndTime] = useState('17:00');
  const [scheduleTitle, setScheduleTitle] = useState('Counter shift');
  const [scheduleStationLabel, setScheduleStationLabel] = useState('Front counter iPad');
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);

  async function refresh(authToken: string, nextUserId?: string | null) {
    const requestedUserId = resolveRequestedAttendanceUserId(
      nextUserId ?? selectedUserId ?? undefined,
      session?.user.id,
    );
    const current = await getAttendanceCurrent(
      authToken,
      outletId,
      requestedUserId,
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
          resolveRequestedAttendanceUserId(selectedUserId ?? undefined, session?.user.id),
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
  const scheduledShifts = payload?.scheduledShifts ?? [];
  const settings = payload?.settings;
  const outletAccess = useMemo(
    () => session?.user.outlets.find((entry) => entry.id === outletId) ?? null,
    [outletId, session],
  );
  const canManageSchedule =
    outletAccess?.permissions.includes('user.manage') ?? false;
  const shiftBoard = useMemo(() => scheduledShifts, [scheduledShifts]);
  const selectedShift =
    shiftBoard.find((entry) => entry.id === selectedShiftId) ??
    shiftBoard.find((entry) => entry.user.id === selectedUser?.id) ??
    null;
  const activeStaffCount = staffRoster.filter((entry) => entry.activeSession).length;
  const groupedShifts = useMemo(
    () => groupShiftsByDay(shiftBoard),
    [shiftBoard],
  );
  const manualSelection =
    selectedUserId && !selectedShift ? staffRoster.find((entry) => entry.id === selectedUserId) : null;

  function selectShiftForStation(entry: AttendanceShiftEntry) {
    setSelectedShiftId(entry.id);
    setSelectedUserId(entry.user.id);
    setScheduleUserId(entry.user.id);
    setPhotoDataUrl(undefined);
    setPhotoName(null);
    setSuccess(null);
    setError(null);
  }

  function selectManualStaff(userId: string) {
    setSelectedShiftId(null);
    setSelectedUserId(userId);
    setScheduleUserId(userId);
    setPhotoDataUrl(undefined);
    setPhotoName(null);
    setSuccess(null);
    setError(null);
  }

  useEffect(() => {
    if (staffRoster.length === 0) {
      setScheduleUserId(null);
      return;
    }
    if (scheduleUserId && staffRoster.some((entry) => entry.id === scheduleUserId)) {
      return;
    }
    setScheduleUserId(staffRoster[0]?.id ?? null);
  }, [scheduleUserId, staffRoster]);

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
      const requestedUserId = resolveRequestedAttendanceUserId(
        selectedUser.id,
        session.user.id,
      );
      if (action === 'in') {
        await clockInAttendance(session.accessToken, outletId, {
          userId: requestedUserId,
          scheduledShiftId:
            selectedShift?.user.id === selectedUser.id ? selectedShift.id : undefined,
          deviceLabel: deviceLabel.trim() || undefined,
          note: note.trim() || undefined,
          photoDataUrl,
        });
        setSuccess(`${selectedUser.fullName} clocked in.`);
      } else {
        await clockOutAttendance(session.accessToken, outletId, {
          userId: requestedUserId,
          scheduledShiftId:
            selectedShift?.user.id === selectedUser.id ? selectedShift.id : undefined,
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
          ? formatAttendanceError(submitError.message)
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

  async function handleCreateShift() {
    if (!session?.accessToken) {
      return;
    }
    const targetUserId = scheduleUserId ?? '';
    if (!targetUserId) {
      setError('Select a staff member before creating a shift.');
      return;
    }
    const startsAt = combineLocalDateTime(scheduleDate, scheduleStartTime);
    const endsAt = combineLocalDateTime(scheduleDate, scheduleEndTime);
    if (!startsAt || !endsAt) {
      setError('Choose a valid shift date and time range.');
      return;
    }
    setScheduleBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const created = (await createAttendanceSchedule(session.accessToken, outletId, {
        userId: targetUserId,
        title: scheduleTitle.trim() || 'Service shift',
        stationLabel: scheduleStationLabel.trim() || undefined,
        note: scheduleNote.trim() || undefined,
        startsAt,
        endsAt,
      })) as AttendanceShiftEntry;
      setSelectedShiftId(created.id);
      setSelectedUserId(created.user.id);
      setScheduleNote('');
      await refresh(session.accessToken, created.user.id);
      setSuccess(`Scheduled ${created.user.fullName} for ${formatShiftRange(created.startsAt, created.endsAt)}.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create the attendance shift.',
      );
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleCancelShift(shiftId: string) {
    if (!session?.accessToken) {
      return;
    }
    setScheduleBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await cancelAttendanceSchedule(session.accessToken, outletId, shiftId, {
        reason: 'Shift removed from the schedule board.',
      });
      await refresh(session.accessToken, selectedUser?.id);
      if (selectedShiftId === shiftId) {
        setSelectedShiftId(null);
      }
      setSuccess('Shift removed from the schedule board.');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Could not cancel the attendance shift.',
      );
    } finally {
      setScheduleBusy(false);
    }
  }

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
              <h2 className="section-title">Tap the shift, then clock in</h2>
              <p className="supporting-copy">
                Staff select themselves from today&apos;s roster, take a proof photo
                on the iPad, and clock in or out from one shared station.
              </p>
            </div>
            <div className="attendance-hero__meta">
              <span className="status-pill neutral">
                {formatScheduleDate(new Date().toISOString())}
              </span>
              <span className="status-pill success">
                {activeStaffCount} on shift
              </span>
              <span className="status-pill warning">Photo required</span>
              <span className="status-pill neutral">{deviceLabel}</span>
            </div>
          </section>

          <section className="panel section-panel attendance-station-callout">
            <div>
              <p className="eyebrow">Shared iPad flow</p>
              <h2 className="section-title">
                {selectedShift ? selectedShift.user.fullName : selectedUser.fullName}
              </h2>
              <p className="supporting-copy">
                {selectedShift
                  ? `${selectedShift.title} | ${formatShiftRange(selectedShift.startsAt, selectedShift.endsAt)}`
                  : 'Use the timetable first. If a shift was not scheduled, choose the employee manually.'}
              </p>
            </div>
            <div className="support-card__actions">
              <span className="status-pill success">1. Select shift</span>
              <span className="status-pill warning">2. Take photo</span>
              <span className="status-pill neutral">3. Clock action</span>
              <a className="primary-button" href="#attendance-capture-station">
                Go to camera station
              </a>
            </div>
          </section>

          <section className="attendance-board-layout">
            <section className="panel section-panel attendance-board-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Timetable</p>
                  <h2 className="section-title">Tap a shift to clock</h2>
                  <p className="supporting-copy">
                    Full-room schedule board for shared iPad attendance and shift handoff.
                  </p>
                </div>
                <div className="support-inline-meta">
                  <span>{shiftBoard.length} scheduled</span>
                  <span>{activeStaffCount} active now</span>
                  <span>{payload.scheduleWindow ? `${formatScheduleDate(payload.scheduleWindow.from)} to ${formatScheduleDate(payload.scheduleWindow.to)}` : 'This week'}</span>
                </div>
              </div>

              {shiftBoard.length === 0 ? (
                <div className="empty-state attendance-board-empty">
                  <strong>No scheduled shifts yet</strong>
                  <p className="supporting-copy">
                    Start by adding a shift from the planner lane, then staff can tap it here.
                  </p>
                </div>
              ) : (
                <div className="attendance-day-columns">
                  {groupedShifts.map(([dayLabel, dayShifts]) => (
                    <section className="attendance-day-column" key={dayLabel}>
                      <div className="attendance-day-column__header">
                        <div>
                          <p className="eyebrow">Day lane</p>
                          <h3>{dayLabel}</h3>
                        </div>
                        <span className="status-pill neutral">
                          {dayShifts.length} shift{dayShifts.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="attendance-shift-stack">
                        {dayShifts.map((entry) => {
                          const active = entry.id === selectedShift?.id;
                          const roleName =
                            staffRoster.find((staff) => staff.id === entry.user.id)?.roleName ??
                            'Staff';
                          const statusTone =
                            entry.status === 'CANCELLED'
                              ? 'danger'
                              : entry.latestSession?.status === 'CLOCKED_IN'
                                ? 'warning'
                                : entry.status === 'COMPLETED'
                                  ? 'success'
                                  : 'neutral';

                          return (
                            <article
                              className={active ? 'attendance-shift-card active' : 'attendance-shift-card'}
                              key={entry.id}
                            >
                              <div className="attendance-shift-card__top">
                                <div>
                                  <p className="eyebrow">{entry.title}</p>
                                  <h4>{entry.user.fullName}</h4>
                                  <p className="supporting-copy">{roleName}</p>
                                </div>
                                <span className={`status-pill ${statusTone}`}>
                                  {entry.status === 'CANCELLED'
                                    ? 'Cancelled'
                                    : entry.latestSession?.status === 'CLOCKED_IN'
                                      ? 'On shift'
                                      : entry.status === 'COMPLETED'
                                        ? 'Completed'
                                        : 'Scheduled'}
                                </span>
                              </div>

                              <div className="attendance-shift-card__time">
                                <strong>{formatShiftRange(entry.startsAt, entry.endsAt)}</strong>
                                <span>{entry.stationLabel ?? 'Shared station'}</span>
                              </div>

                              <div className="support-inline-meta">
                                <span>{entry.note ?? 'No manager note'}</span>
                                <span>
                                  {entry.latestSession
                                    ? `Last clock ${formatDateTime(entry.latestSession.clockInAt)}`
                                    : 'Not clocked yet'}
                                </span>
                              </div>

                              <div className="attendance-shift-card__actions">
                                <button
                                  className={active ? 'primary-button' : 'secondary-button'}
                                  onClick={() => selectShiftForStation(entry)}
                                  type="button"
                                >
                                  {active
                                    ? 'Selected at station'
                                    : entry.latestSession?.status === 'CLOCKED_IN'
                                      ? 'Continue this shift'
                                      : 'Clock this shift'}
                                </button>
                                {canManageSchedule ? (
                                  <button
                                    className="secondary-button"
                                    disabled={scheduleBusy || entry.status === 'CANCELLED'}
                                    onClick={() => void handleCancelShift(entry.id)}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <aside className="panel section-panel attendance-planner-rail">
              <article className="attendance-planner-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Planner</p>
                    <h2 className="section-title">Manager shift builder</h2>
                    <p className="supporting-copy">
                      Build the timetable here. Staff should spend most of their time on the shift board, not in this form.
                    </p>
                  </div>
                  <span className={`status-pill ${canManageSchedule ? 'success' : 'neutral'}`}>
                    {canManageSchedule ? 'Manager mode' : 'View only'}
                  </span>
                </div>
                {canManageSchedule ? (
                  <>
                    <div className="form-grid attendance-planner-form">
                      <div className="field">
                        <label htmlFor="schedule-user">Employee</label>
                        <select
                          id="schedule-user"
                          onChange={(event) => setScheduleUserId(event.target.value)}
                          value={scheduleUserId ?? ''}
                        >
                          {staffRoster.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.fullName} | {entry.roleName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="schedule-title">Shift title</label>
                        <input
                          id="schedule-title"
                          onChange={(event) => setScheduleTitle(event.target.value)}
                          value={scheduleTitle}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="schedule-date">Date</label>
                        <input
                          id="schedule-date"
                          onChange={(event) => setScheduleDate(event.target.value)}
                          type="date"
                          value={scheduleDate}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="schedule-start">Start</label>
                        <input
                          id="schedule-start"
                          onChange={(event) => setScheduleStartTime(event.target.value)}
                          type="time"
                          value={scheduleStartTime}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="schedule-end">End</label>
                        <input
                          id="schedule-end"
                          onChange={(event) => setScheduleEndTime(event.target.value)}
                          type="time"
                          value={scheduleEndTime}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="schedule-station">Station</label>
                        <input
                          id="schedule-station"
                          onChange={(event) => setScheduleStationLabel(event.target.value)}
                          placeholder="Front counter iPad"
                          value={scheduleStationLabel}
                        />
                      </div>
                      <div className="field field--full">
                        <label htmlFor="schedule-note">Note</label>
                        <input
                          id="schedule-note"
                          onChange={(event) => setScheduleNote(event.target.value)}
                          placeholder="Lunch cover, cashier open, closing handoff..."
                          value={scheduleNote}
                        />
                      </div>
                    </div>
                    <div className="attendance-action-row">
                      <button
                        className="primary-button"
                        disabled={scheduleBusy}
                        onClick={() => void handleCreateShift()}
                        type="button"
                      >
                        {scheduleBusy ? 'Saving shift...' : 'Add shift'}
                      </button>
                      {selectedShift ? (
                        <button
                          className="secondary-button"
                          disabled={scheduleBusy || selectedShift.status === 'CANCELLED'}
                          onClick={() => void handleCancelShift(selectedShift.id)}
                          type="button"
                        >
                          {scheduleBusy ? 'Working...' : 'Cancel selected'}
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="soft-note">
                    A manager sets the timetable. Staff only need to tap their own scheduled shift from the board.
                  </div>
                )}
              </article>

              <article className="attendance-planner-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Fallback</p>
                    <h3 className="section-title">No scheduled shift?</h3>
                  </div>
                  <span className="supporting-copy">{staffRoster.length} staff</span>
                </div>
                <div className="attendance-quick-roster">
                  {staffRoster.map((entry) => {
                    const active = entry.id === selectedUser.id && !selectedShift;
                    return (
                      <button
                        className={active ? 'attendance-quick-chip active' : 'attendance-quick-chip'}
                        key={entry.id}
                        onClick={() => selectManualStaff(entry.id)}
                        type="button"
                      >
                        <strong>{entry.fullName}</strong>
                        <span>{entry.roleName}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            </aside>

          </section>

          <section className="attendance-station-grid">
            <section
              className="panel section-panel attendance-capture-card"
              id="attendance-capture-station"
            >
              <div className="section-header">
                <div>
                  <p className="eyebrow">Clock action</p>
                  <h2 className="section-title">{selectedUser.fullName}</h2>
                  <p className="supporting-copy">
                    {selectedUser.roleName} | {selectedUser.email}
                  </p>
                  {selectedShift ? (
                    <div className="support-inline-meta">
                      <span>{selectedShift.title}</span>
                      <span>{formatShiftRange(selectedShift.startsAt, selectedShift.endsAt)}</span>
                      <span>{selectedShift.stationLabel ?? 'Shared station'}</span>
                    </div>
                  ) : manualSelection ? (
                    <div className="support-inline-meta">
                      <span>Manual selection</span>
                      <span>No scheduled shift selected</span>
                    </div>
                  ) : null}
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
                  <span className="metric-label">Shift window</span>
                  <strong className="scope-card-value">
                    {selectedShift
                      ? formatShiftRange(selectedShift.startsAt, selectedShift.endsAt)
                      : 'Manual'}
                  </strong>
                </article>
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Photo policy</span>
                  <strong className="scope-card-value">Required</strong>
                </article>
                <article className="sub-panel surface-panel">
                  <span className="metric-label">Recent sessions</span>
                  <strong className="scope-card-value">
                    {recentSessions.length}
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

function resolveRequestedAttendanceUserId(
  selectedUserId?: string | null,
  sessionUserId?: string | null,
) {
  if (!selectedUserId) {
    return undefined;
  }
  if (sessionUserId && selectedUserId === sessionUserId) {
    return undefined;
  }
  return selectedUserId;
}

function formatAttendanceError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('property userid should not exist')) {
    return 'This API deployment is still on the older attendance contract. Redeploy the API first, then retry shared-station clocking.';
  }
  if (normalized.includes('request entity too large')) {
    return 'The captured photo is too large. Move closer, retake the photo, and try again.';
  }
  return message;
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

function formatScheduleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatShiftRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Unscheduled';
  }
  return `${new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(start)} - ${new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(end)}`;
}

function groupShiftsByDay(shifts: AttendanceShiftEntry[]) {
  const groups = new Map<string, AttendanceShiftEntry[]>();
  for (const shift of shifts) {
    const label = new Intl.DateTimeFormat('en-SG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(shift.startsAt));
    const existing = groups.get(label) ?? [];
    existing.push(shift);
    groups.set(label, existing);
  }
  return Array.from(groups.entries());
}

function combineLocalDateTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) {
    return null;
  }
  const combined = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(combined.getTime())) {
    return null;
  }
  return combined.toISOString();
}

function getDefaultScheduleDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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
