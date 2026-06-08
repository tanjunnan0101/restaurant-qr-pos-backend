'use client';

import type { LoginResponse, StaffSession } from './types';

const SESSION_KEY = 'restaurant-pos-staff-session';

export function toSession(login: LoginResponse): StaffSession {
  return {
    accessToken: login.accessToken,
    expiresInSeconds: login.expiresInSeconds,
    expiresAt: new Date(
      Date.now() + login.expiresInSeconds * 1000,
    ).toISOString(),
    user: login.user,
  };
}

export function loadSession(): StaffSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StaffSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: StaffSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
}
