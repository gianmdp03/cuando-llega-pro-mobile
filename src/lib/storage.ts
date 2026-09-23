import * as SecureStore from 'expo-secure-store';
import { createMMKV } from 'react-native-mmkv';

import type { AuthResponse, AuthenticatedUser } from '@/src/types/api';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_EXPIRES_AT_KEY = 'auth_expires_at';
const AUTH_USER_KEY = 'authenticated_user';
let memoryToken: string | null | undefined;
let pendingTokenRead: Promise<string | null> | undefined;
let tokenGeneration = 0;

/** Shared MMKV storage for non-secret session metadata and future UI preferences. */
export const storage = createMMKV({ id: 'cuando-llega-pro' });

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('Secure storage is not available on this device.');
    this.name = 'SecureStorageUnavailableError';
  }
}

async function requireSecureStorage(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new SecureStorageUnavailableError();
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (memoryToken !== undefined) {
    return memoryToken;
  }

  if (!pendingTokenRead) {
    const generation = tokenGeneration;
    pendingTokenRead = (async () => {
      await requireSecureStorage();
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

      // A login or logout may complete while SecureStore is being read. Never
      // let that older read overwrite the newer in-memory session state.
      if (generation === tokenGeneration) {
        memoryToken = token;
      }

      return memoryToken ?? null;
    })().finally(() => {
      pendingTokenRead = undefined;
    });
  }

  return pendingTokenRead;
}

export async function setAuthSession(response: AuthResponse): Promise<AuthSession> {
  tokenGeneration += 1;
  await requireSecureStorage();

  const expiresAt =
    response.expiresIn > 0
      ? new Date(Date.now() + response.expiresIn).toISOString()
      : 'NO_EXPIRATION';
  const user = response.user;

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, response.token);
  memoryToken = response.token;
  storage.set(AUTH_EXPIRES_AT_KEY, expiresAt);
  storage.set(AUTH_USER_KEY, JSON.stringify(user));

  return { token: response.token, expiresAt, user };
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const [token, expiresAt, serializedUser] = await Promise.all([
    getAuthToken(),
    Promise.resolve(storage.getString(AUTH_EXPIRES_AT_KEY)),
    Promise.resolve(storage.getString(AUTH_USER_KEY)),
  ]);

  if (!token || !expiresAt || !serializedUser) {
    if (token || expiresAt || serializedUser) {
      await clearAuthSession();
    }

    return null;
  }

  try {
    const user: unknown = JSON.parse(serializedUser);

    if (!isAuthenticatedUser(user)) {
      await clearAuthSession();
      return null;
    }

    if (expiresAt !== 'NO_EXPIRATION') {
      const expiresAtTime = Date.parse(expiresAt);
      if (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.now()) {
        await clearAuthSession();
        return null;
      }
    }

    return { token, expiresAt, user };
  } catch {
    await clearAuthSession();
    return null;
  }
}

export async function clearAuthSession(): Promise<void> {
  tokenGeneration += 1;
  memoryToken = null;
  await requireSecureStorage();
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  storage.remove(AUTH_EXPIRES_AT_KEY);
  storage.remove(AUTH_USER_KEY);
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'number' &&
    typeof user.email === 'string' &&
    typeof user.fullName === 'string' &&
    typeof user.role === 'string' &&
    typeof user.createdAt === 'string' &&
    typeof user.presetsCount === 'number'
  );
}
