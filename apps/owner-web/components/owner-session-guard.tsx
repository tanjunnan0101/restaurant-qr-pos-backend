'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, loadSession } from '@/lib/session';
import type { OwnerSession } from '@/lib/types';

export function useOwnerSession() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const current = loadSession();
    if (!current) {
      setLoading(false);
      router.replace('/login');
      return;
    }
    setSession(current);
    setLoading(false);
  }, [router, pathname]);

  function signOut() {
    clearSession();
    router.replace('/login');
  }

  return { session, loading, signOut };
}
