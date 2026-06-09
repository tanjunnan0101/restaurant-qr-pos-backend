'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  createOutletStaffUser,
  getAssignableStaffRoles,
  getOutletAuditLogs,
  getOutletStaff,
  removeOutletStaffAccess,
  reissueOutletStaffActivation,
  updateOutletStaffRole,
} from '@/lib/api';
import { OutletAuditFeed } from '@/components/outlet-audit-feed';
import { createOperationsSocket, outletOperationsEvents } from '@/lib/realtime';
import type {
  AssignableStaffRole,
  OutletAuditLogEntry,
  OutletStaffUser,
  RealtimeStatus,
} from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

export function OutletStaffPage() {
  const {
    session,
    outlet,
    outletId,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [users, setUsers] = useState<OutletStaffUser[]>([]);
  const [roles, setRoles] = useState<AssignableStaffRole[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [busy, setBusy] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<OutletAuditLogEntry[]>([]);
  const [newStaff, setNewStaff] = useState({
    email: '',
    fullName: '',
    roleKey: '',
  });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outletAccess = useMemo(
    () => session?.user.outlets.find((entry) => entry.id === outletId) ?? null,
    [outletId, session],
  );
  const canManageUsers = outletAccess?.permissions.includes('user.manage') ?? false;
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
    if (!session?.accessToken || !outletId || !canManageUsers) {
      setUsers([]);
      setRoles([]);
      return;
    }

    const authToken = session.accessToken;
    let cancelled = false;

    async function load() {
      setBusy(true);
      setStatus('connecting');
      setError(null);
      try {
        const [staffResponse, rolesResponse, auditResponse] = await Promise.all([
          getOutletStaff(authToken, outletId),
          getAssignableStaffRoles(authToken, outletId),
          getOutletAuditLogs(authToken, outletId, { limit: 30 }),
        ]);
        if (!cancelled) {
          setUsers(staffResponse.users);
          setRoles(rolesResponse.roles);
          setAuditEntries(
            auditResponse.entries.filter((entry) =>
              entry.actionType.startsWith('STAFF_'),
            ),
          );
          setNewStaff((current) => ({
            ...current,
            roleKey: current.roleKey || rolesResponse.roles[0]?.systemKey || '',
          }));
          setStatus('connected');
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus('error');
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Staff roster failed to load.',
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
  }, [canManageUsers, outletId, refreshTick, session]);

  useEffect(() => {
    if (!session?.accessToken || !outletId || !canManageUsers) {
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
  }, [canManageUsers, outletId, queueRefresh, session]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return users;
    }
    return users.filter((user) =>
      [
        user.fullName,
        user.email,
        user.role.name,
        user.role.systemKey,
        user.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [searchTerm, users]);

  const pendingUsers = users.filter((user) => user.activation.pending);
  const activeUsers = users.filter((user) => user.status === 'ACTIVE');

  async function handleCreateStaffUser() {
    if (!session?.accessToken || !outletId) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Create outlet access for ${newStaff.fullName || 'this staff member'} with the selected role?`,
      )
    ) {
      return;
    }
    setActionBusyId('create-staff-user');
    setError(null);
    setActivationMessage(null);
    try {
      const created = await createOutletStaffUser(
        session.accessToken,
        outletId,
        newStaff,
      );
      setNewStaff((current) => ({ ...current, email: '', fullName: '' }));
      setRefreshTick((current) => current + 1);
      if (created.activation?.url) {
        setActivationMessage(
          `Activation link for ${created.email ?? 'staff user'}: ${created.activation.url}`,
        );
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to create staff user.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRoleChange(userId: string, roleKey: string) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    const role = roles.find((entry) => entry.systemKey === roleKey);
    if (!role) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Change this staff member's role to ${role.name}?`)
    ) {
      return;
    }
    setActionBusyId(userId);
    setError(null);
    try {
      const updated = await updateOutletStaffRole(
        session.accessToken,
        outletId,
        userId,
        {
          roleKey,
          reason: `Staff role updated to ${role.name} from the staff console.`,
        },
      );

      setUsers((current) =>
        current.map((user) =>
          user.id === userId && updated.role
            ? {
                ...user,
                role: updated.role,
              }
            : user,
        ),
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to update staff role.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleReissueActivation(user: OutletStaffUser) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Reissue a new activation link for ${user.fullName}?`)
    ) {
      return;
    }
    setActionBusyId(`reissue-${user.id}`);
    setError(null);
    setActivationMessage(null);
    try {
      const result = await reissueOutletStaffActivation(
        session.accessToken,
        outletId,
        user.id,
        {
          reason: `Staff member ${user.fullName} requested a new activation link.`,
        },
      );
      setUsers((current) =>
        current.map((entry) =>
          entry.id === user.id
            ? {
                ...entry,
                activation: {
                  pending: true,
                  expiresAt:
                    result.activation?.expiresAt ?? entry.activation.expiresAt,
                },
              }
            : entry,
        ),
      );
      if (result.activation?.url) {
        setActivationMessage(
          `New activation link for ${user.email}: ${result.activation.url}`,
        );
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to reissue activation.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRemoveAccess(user: OutletStaffUser) {
    if (!session?.accessToken || !outletId) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Remove ${user.fullName} from this outlet roster? They will lose access to this outlet immediately.`,
      )
    ) {
      return;
    }
    setActionBusyId(`remove-${user.id}`);
    setError(null);
    try {
      const result = await removeOutletStaffAccess(
        session.accessToken,
        outletId,
        user.id,
        {
          reason: `Removed ${user.fullName} from the outlet staff roster from the staff console.`,
        },
      );

      if (result.removed) {
        setUsers((current) => current.filter((entry) => entry.id !== user.id));
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to remove outlet access.',
      );
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Team"
      subtitle="Manage outlet access, roles, and activation links from the floor console."
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

      {activationMessage ? (
        <section className="panel section-panel">
          <div className="alert success">{activationMessage}</div>
        </section>
      ) : null}

      {!canManageUsers ? (
        <section className="panel section-panel">
          <div className="empty-state">
            <h3>Staff management is unavailable</h3>
            <p className="supporting-copy">
              This session does not currently have `user.manage` permission for
              the selected outlet.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="operations-layout support-station-layout">
            <aside className="panel section-panel support-control-rail">
              <article className="support-config-card">
                <div className="support-config-card__header">
                  <div>
                    <p className="eyebrow">Team station</p>
                    <h2 className="section-title">Roster control</h2>
                  </div>
                  <span className="status-pill success">
                    {formatRealtimeStatus(status)}
                  </span>
                </div>
                <p className="supporting-copy">
                  Add staff to the outlet, assign the correct role, and keep
                  activation links moving so the shift never stalls at sign-in.
                </p>
                <div className="support-inline-meta">
                  <span>{users.length} rostered</span>
                  <span>{activeUsers.length} active</span>
                  <span>{pendingUsers.length} pending</span>
                  <span>{roles.length} roles</span>
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
                </div>
              </article>

              <article className="support-config-card">
                <div className="support-config-card__header">
                  <div>
                    <p className="eyebrow">Add staff</p>
                    <h3>Create outlet access</h3>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="staff-full-name">Full name</label>
                  <input
                    id="staff-full-name"
                    onChange={(event) =>
                      setNewStaff((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    placeholder="Front Counter Cashier"
                    value={newStaff.fullName}
                  />
                </div>
                <div className="field">
                  <label htmlFor="staff-email">Email</label>
                  <input
                    id="staff-email"
                    onChange={(event) =>
                      setNewStaff((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="cashier@example.com"
                    value={newStaff.email}
                  />
                </div>
                <div className="field">
                  <label htmlFor="staff-role">Role</label>
                  <select
                    id="staff-role"
                    onChange={(event) =>
                      setNewStaff((current) => ({
                        ...current,
                        roleKey: event.target.value,
                      }))
                    }
                    value={newStaff.roleKey}
                  >
                    <option value="">Select role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.systemKey}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                {newStaff.roleKey ? (
                  <div className="support-note">
                    {
                      roles.find((role) => role.systemKey === newStaff.roleKey)
                        ?.description
                    }
                  </div>
                ) : null}
                <div className="support-card__actions">
                  <button
                    className="primary-button"
                    disabled={
                      actionBusyId === 'create-staff-user' ||
                      newStaff.fullName.trim().length < 2 ||
                      newStaff.email.trim().length < 5 ||
                      newStaff.roleKey.trim().length === 0
                    }
                    onClick={() => void handleCreateStaffUser()}
                    type="button"
                  >
                    {actionBusyId === 'create-staff-user'
                      ? 'Creating...'
                      : 'Create access'}
                  </button>
                </div>
              </article>

              <article className="support-config-card">
                <div className="support-config-card__header">
                  <div>
                    <p className="eyebrow">Role library</p>
                    <h3>Assignable roles</h3>
                  </div>
                </div>
                {roles.length === 0 ? (
                  <p className="supporting-copy">No assignable roles found.</p>
                ) : (
                  <div className="list-block">
                    {roles.map((role) => (
                      <article className="list-item" key={role.id}>
                        <div className="support-list-card__header">
                          <div>
                            <h3>{role.name}</h3>
                            <p className="supporting-copy">
                              {role.description ?? 'No description provided.'}
                            </p>
                          </div>
                          <span className="status-pill neutral">
                            {role.systemKey}
                          </span>
                        </div>
                        <div className="tag-row">
                          {role.permissions.slice(0, 6).map((permission) => (
                            <span className="tag" key={`${role.id}-${permission}`}>
                              {permission}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            </aside>

            <div className="support-board-panel">
              <section className="support-summary-grid">
                <article className="support-card">
                  <div className="support-card__header">
                    <div>
                      <p className="eyebrow">Roster</p>
                      <h3>{users.length}</h3>
                    </div>
                    <span className="status-pill neutral">People</span>
                  </div>
                  <p className="supporting-copy">
                    Staff accounts with access to this outlet.
                  </p>
                </article>
                <article className="support-card">
                  <div className="support-card__header">
                    <div>
                      <p className="eyebrow">Pending</p>
                      <h3>{pendingUsers.length}</h3>
                    </div>
                    <span className="status-pill warning">Activation</span>
                  </div>
                  <p className="supporting-copy">
                    Accounts still waiting to finish setup.
                  </p>
                </article>
                <article className="support-card">
                  <div className="support-card__header">
                    <div>
                      <p className="eyebrow">Active</p>
                      <h3>{activeUsers.length}</h3>
                    </div>
                    <span className="status-pill success">Ready</span>
                  </div>
                  <p className="supporting-copy">
                    Staff who can sign in immediately.
                  </p>
                </article>
                <article className="support-card">
                  <div className="support-card__header">
                    <div>
                      <p className="eyebrow">Sync</p>
                      <h3>{formatRealtimeStatus(status)}</h3>
                    </div>
                    <span className="status-pill neutral">Live</span>
                  </div>
                  <p className="supporting-copy">
                    Roster refresh state for this outlet.
                  </p>
                </article>
              </section>

              <article className="panel section-panel support-card">
                <div className="support-card__header">
                  <div>
                    <p className="eyebrow">Roster view</p>
                    <h2 className="section-title">Current team</h2>
                  </div>
                  <span className="status-pill neutral">
                    {filteredUsers.length} shown
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="staff-search">Search roster</label>
                  <input
                    id="staff-search"
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name, email, role, or status"
                    value={searchTerm}
                  />
                </div>
              </article>

              {busy ? (
                <section className="panel section-panel">
                  <p className="supporting-copy">Loading staff roster...</p>
                </section>
              ) : filteredUsers.length === 0 ? (
                <section className="panel section-panel">
                  <div className="empty-state">
                    <h3>No matching staff users</h3>
                    <p className="supporting-copy">
                      Clear the search or create the first outlet access.
                    </p>
                  </div>
                </section>
              ) : (
                <section className="support-list-grid">
                  {filteredUsers.map((user) => (
                    <article
                      className="panel section-panel support-list-card"
                      key={user.id}
                    >
                      <div className="support-list-card__header">
                        <div>
                          <p className="eyebrow">Team member</p>
                          <h3>{user.fullName}</h3>
                          <p className="supporting-copy">{user.email}</p>
                        </div>
                        <div className="tag-row">
                          <span
                            className={`status-pill ${
                              user.status === 'ACTIVE' ? 'success' : 'warning'
                            }`}
                          >
                            {formatEnum(user.status)}
                          </span>
                          <span className="status-pill neutral">
                            {user.role.name}
                          </span>
                        </div>
                      </div>

                      <div className="support-inline-meta">
                        <span>Role key: {user.role.systemKey}</span>
                        <span>
                          Last login:{' '}
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleString()
                            : 'Never'}
                        </span>
                        {user.activation.pending ? (
                          <span>
                            Pending until{' '}
                            {user.activation.expiresAt
                              ? new Date(user.activation.expiresAt).toLocaleString()
                              : 'unknown'}
                          </span>
                        ) : null}
                      </div>

                      <div className="tag-row">
                        {user.role.permissions.slice(0, 8).map((permission) => (
                          <span className="tag" key={`${user.id}-${permission}`}>
                            {permission}
                          </span>
                        ))}
                      </div>

                      <div className="form-grid">
                        <div className="field">
                          <label htmlFor={`role-${user.id}`}>Role</label>
                          <select
                            disabled={actionBusyId === user.id}
                            id={`role-${user.id}`}
                            onChange={(event) =>
                              void handleRoleChange(user.id, event.target.value)
                            }
                            value={user.role.systemKey}
                          >
                            {roles.map((role) => (
                              <option key={role.id} value={role.systemKey}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="support-list-card__actions">
                        {user.activation.pending ? (
                          <button
                            className="secondary-button"
                            disabled={actionBusyId === `reissue-${user.id}`}
                            onClick={() => void handleReissueActivation(user)}
                            type="button"
                          >
                            {actionBusyId === `reissue-${user.id}`
                              ? 'Reissuing...'
                              : 'Reissue activation'}
                          </button>
                        ) : null}
                        <button
                          className="secondary-button"
                          disabled={actionBusyId === `remove-${user.id}`}
                          onClick={() => void handleRemoveAccess(user)}
                          type="button"
                        >
                          {actionBusyId === `remove-${user.id}`
                            ? 'Removing...'
                            : 'Remove access'}
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
            </div>
          </section>
          <OutletAuditFeed
            entries={auditEntries}
            subtitle="Recent staff assignments, role changes, activation reissues, and access removals for this outlet."
            title="Staff activity"
          />
        </>
      )}
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
      return 'Loaded';
    case 'connecting':
      return 'Refreshing';
    case 'error':
      return 'Needs attention';
    default:
      return 'Idle';
  }
}
