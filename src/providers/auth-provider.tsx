import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { queryClient } from '@/src/lib/query-client';
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
  type AuthSession,
} from '@/src/lib/storage';
import type { AuthResponse } from '@/src/types/api';

type AuthContextValue = {
  session: AuthSession | null;
  isRestoring: boolean;
  signIn: (response: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void getAuthSession()
      .then((restoredSession) => {
        if (isMounted) {
          setSession(restoredSession);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsRestoring(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback(async (response: AuthResponse) => {
    const nextSession = await setAuthSession(response);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    await clearAuthSession();
    queryClient.clear();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isRestoring, signIn, signOut }),
    [isRestoring, session, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return value;
}
