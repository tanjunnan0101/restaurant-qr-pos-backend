'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createOutletStaffUser,
  getOutletStaff,
  getOutletStaffRoles,
  removeOutletStaffAccess,
  reissueOutletStaffActivation,
  updateOutletStaffRole,
} from '@/lib/api';
import type { OutletStaffUser, StaffRoleSummary } from '@/lib/types';
import {
  OutletHeader,
  OutletPageLayout,
  useOutletContext,
} from './outlet-page-base';

export function OutletStaffPage() {
  const {
    outletId,
    session,
    loading,
    outlet,
    error: outletError,
    busy: outletBusy,
  } = useOutletContext();
  const [staff, setStaff] = useState<OutletStaffUser[]>([]);
  const [roles, setRoles] = useState<StaffRoleSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activationLink, setActivationLink] = useState<{
    label: string;
    url: string;
    expiresAt: string | null;
  } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [roleBusyUserId, setRoleBusyUserId] = useState<string | null>(null);
  const [activationBusyUserId, setActivationBusyUserId] = useState<string | null>(
    null,
  );
  const [removeBusyUserId, setRemoveBusyUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('CASHIER');
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});
  const [roleReasons, setRoleReasons] = useState<Record<string, string>>({});

  async function refresh(authToken: string) {
    const [staffResponse, rolesResponse] = await Promise.all([
      getOutletStaff(authToken, outletId),
      getOutletStaffRoles(authToken, outletId),
    ]);
    setStaff(staffResponse.users);
    setRoles(rolesResponse.roles);
    setRoleSelections(
      Object.fromEntries(
        staffResponse.users.map((user) => [user.id, user.role.systemKey]),
      ),
    );
    setRoleReasons(
      Object.fromEntries(
        staffResponse.users.map((user) => [
          user.id,
          `Updated ${user.fullName}'s outlet role.`,
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
        const [staffResponse, rolesResponse] = await Promise.all([
          getOutletStaff(authToken, outletId),
          getOutletStaffRoles(authToken, outletId),
        ]);
        if (!cancelled) {
          setStaff(staffResponse.users);
          setRoles(rolesResponse.roles);
          setRoleSelections(
            Object.fromEntries(
              staffResponse.users.map((user) => [user.id, user.role.systemKey]),
            ),
          );
          setRoleReasons(
            Object.fromEntries(
              staffResponse.users.map((user) => [
                user.id,
                `Updated ${user.fullName}'s outlet role.`,
              ]),
            ),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load outlet staff.',
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

  const roleOptions = useMemo(
    () => roles.map((role) => ({ value: role.systemKey, label: role.name })),
    [roles],
  );

  async function handleCreateStaffUser() {
    if (!session?.accessToken) {
      return;
    }
    setCreateBusy(true);
    setActionError(null);
    setActionSuccess(null);
    setActivationLink(null);

    try {
      const created = await createOutletStaffUser(session.accessToken, outletId, {
        email: email.trim(),
        fullName: fullName.trim(),
        roleKey,
      });
      await refresh(session.accessToken);
      setActionSuccess(`${created.fullName} is now assigned to this outlet.`);
      setFullName('');
      setEmail('');
      setRoleKey('CASHIER');
      if (created.activation.url) {
        setActivationLink({
          label: `Activation link for ${created.fullName}`,
          url: created.activation.url,
          expiresAt: created.activation.expiresAt,
        });
      }
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to create the staff account.',
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRoleUpdate(user: OutletStaffUser) {
    if (!session?.accessToken) {
      return;
    }
    const selectedRoleKey = roleSelections[user.id] ?? user.role.systemKey;
    const reason = roleReasons[user.id]?.trim() ?? '';
    if (!reason) {
      setActionError('Add a reason before updating the staff role.');
      return;
    }

    setRoleBusyUserId(user.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      await updateOutletStaffRole(session.accessToken, outletId, user.id, {
        roleKey: selectedRoleKey,
        reason,
      });
      await refresh(session.accessToken);
      setActionSuccess(`${user.fullName}'s role has been updated.`);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to update the staff role.',
      );
    } finally {
      setRoleBusyUserId(null);
    }
  }

  async function handleReissueActivation(user: OutletStaffUser) {
    if (!session?.accessToken) {
      return;
    }

    setActivationBusyUserId(user.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await reissueOutletStaffActivation(
        session.accessToken,
        outletId,
        user.id,
        {
          reason: `Activation reissued for ${user.fullName}.`,
        },
      );
      setActionSuccess(`A fresh activation link has been issued for ${user.fullName}.`);
      if (result.activation.url) {
        setActivationLink({
          label: `Activation link for ${user.fullName}`,
          url: result.activation.url,
          expiresAt: result.activation.expiresAt,
        });
      }
      await refresh(session.accessToken);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to reissue activation.',
      );
    } finally {
      setActivationBusyUserId(null);
    }
  }

  async function handleRemoveAccess(user: OutletStaffUser) {
    if (!session?.accessToken) {
      return;
    }
    if (session.user.id === user.id) {
      setActionError('Use another owner account if you need to hand over access.');
      return;
    }

    const reason = roleReasons[user.id]?.trim() ?? '';
    if (!reason) {
      setActionError('Add a reason before removing outlet access.');
      return;
    }

    setRemoveBusyUserId(user.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      await removeOutletStaffAccess(session.accessToken, outletId, user.id, {
        reason,
      });
      await refresh(session.accessToken);
      setActionSuccess(`${user.fullName} no longer has access to this outlet.`);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to remove outlet access.',
      );
    } finally {
      setRemoveBusyUserId(null);
    }
  }

  return (
    <OutletPageLayout
      title="Staff and roles"
      subtitle="Manage outlet staff access, assign daily roles, and issue activation links for new team members."
    >
      {outlet ? <OutletHeader outlet={outlet} /> : null}

      {loading || outletBusy || busy ? (
        <section className="section-panel">
          <p>Loading staff access and role data...</p>
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
                <p className="eyebrow">Outlet team</p>
                <h2 className="serif">Create staff access</h2>
                <p>
                  Add an outlet staff member, assign the operating role, and copy
                  the activation link if the account is not active yet.
                </p>
              </div>
            </div>

            {actionError ? <div className="alert error">{actionError}</div> : null}
            {actionSuccess ? (
              <div className="alert success">{actionSuccess}</div>
            ) : null}

            {activationLink ? (
              <div className="info-card">
                <span className="metric-label">{activationLink.label}</span>
                <p className="qr-link-block">
                  <a href={activationLink.url} rel="noreferrer" target="_blank">
                    {activationLink.url}
                  </a>
                </p>
                <p className="metric-note">
                  Expires {formatDateTime(activationLink.expiresAt) ?? 'soon'}.
                </p>
              </div>
            ) : null}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="staff-full-name">Full name</label>
                <input
                  id="staff-full-name"
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Kitchen Lead"
                  value={fullName}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-email">Email</label>
                <input
                  id="staff-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="kitchen@example.com"
                  type="email"
                  value={email}
                />
              </div>
              <div className="field">
                <label htmlFor="staff-role">Role</label>
                <select
                  id="staff-role"
                  onChange={(event) => setRoleKey(event.target.value)}
                  value={roleKey}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={
                    createBusy || fullName.trim().length < 2 || email.trim().length < 5
                  }
                  onClick={() => void handleCreateStaffUser()}
                  type="button"
                >
                  {createBusy ? 'Creating...' : 'Create staff access'}
                </button>
              </div>
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Current access</p>
                <h2 className="serif">Outlet staff roster</h2>
                <p>
                  Adjust the role for this outlet or reissue activation for
                  staff who have not completed account setup yet. You can also
                  revoke outlet access when someone leaves this roster.
                </p>
              </div>
            </div>

            <div className="list-block">
              {staff.length === 0 ? (
                <div className="empty-state">
                  <strong>No staff are assigned to this outlet yet.</strong>
                </div>
              ) : (
                staff.map((user) => (
                  <article className="list-item" key={user.id}>
                    <div className="section-header">
                      <div>
                        <h3>{user.fullName}</h3>
                        <p>{user.email}</p>
                      </div>
                      <div className="badge-row">
                        <span
                          className={
                            user.status === 'ACTIVE' ? 'badge success' : 'badge warn'
                          }
                        >
                          {user.status}
                        </span>
                        <span className="badge">{user.role.name}</span>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <article className="info-card">
                        <span className="metric-label">Current role</span>
                        <span className="metric-value scope-card-value">
                          {user.role.name}
                        </span>
                        <p className="metric-note">{user.role.systemKey}</p>
                      </article>
                      <article className="info-card">
                        <span className="metric-label">Last login</span>
                        <span className="metric-value scope-card-value">
                          {formatDateTime(user.lastLoginAt) ?? 'Never'}
                        </span>
                        <p className="metric-note">
                          {user.activation.pending
                            ? `Activation expires ${formatDateTime(user.activation.expiresAt) ?? 'soon'}.`
                            : 'Account is active.'}
                        </p>
                      </article>
                    </div>

                    <div className="tag-row">
                      {user.role.permissions.map((permission) => (
                        <span className="tag" key={permission}>
                          {permission}
                        </span>
                      ))}
                    </div>

                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor={`role-${user.id}`}>Role</label>
                        <select
                          id={`role-${user.id}`}
                          onChange={(event) =>
                            setRoleSelections((current) => ({
                              ...current,
                              [user.id]: event.target.value,
                            }))
                          }
                          value={roleSelections[user.id] ?? user.role.systemKey}
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`reason-${user.id}`}>Reason</label>
                        <input
                          id={`reason-${user.id}`}
                          onChange={(event) =>
                            setRoleReasons((current) => ({
                              ...current,
                              [user.id]: event.target.value,
                            }))
                          }
                          value={
                            roleReasons[user.id] ??
                            `Updated ${user.fullName}'s outlet role.`
                          }
                        />
                      </div>
                    </div>

                    <div className="action-row">
                      <button
                        className="primary-button"
                        disabled={
                          roleBusyUserId === user.id ||
                          (roleSelections[user.id] ?? user.role.systemKey) ===
                            user.role.systemKey
                        }
                        onClick={() => void handleRoleUpdate(user)}
                        type="button"
                      >
                        {roleBusyUserId === user.id ? 'Updating...' : 'Update role'}
                      </button>
                      {user.activation.pending ? (
                        <button
                          className="secondary-button"
                          disabled={activationBusyUserId === user.id}
                          onClick={() => void handleReissueActivation(user)}
                          type="button"
                        >
                          {activationBusyUserId === user.id
                            ? 'Reissuing...'
                            : 'Reissue activation'}
                        </button>
                      ) : null}
                      <button
                        className="secondary-button"
                        disabled={
                          removeBusyUserId === user.id || session?.user.id === user.id
                        }
                        onClick={() => void handleRemoveAccess(user)}
                        type="button"
                      >
                        {removeBusyUserId === user.id
                          ? 'Removing...'
                          : 'Remove access'}
                      </button>
                    </div>
                    {session?.user.id === user.id ? (
                      <p className="metric-note">
                        Your current owner session cannot remove its own outlet access.
                      </p>
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
