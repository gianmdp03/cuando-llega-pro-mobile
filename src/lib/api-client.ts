import type { ProblemDetail, ProblemFieldError } from '@/src/types/api';

import { queryClient } from './query-client';
import { clearAuthSession, getAuthToken } from './storage';

const DEFAULT_TIMEOUT_MS = 15_000;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type ApiRequestOptions<TBody = undefined> = {
  method?: HttpMethod;
  body?: TBody;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class ProblemDetailError extends Error {
  readonly problem: ProblemDetail;
  readonly status: number;

  constructor(problem: ProblemDetail) {
    super(problem.detail);
    this.name = 'ProblemDetailError';
    this.problem = problem;
    this.status = problem.status;
  }
}

export class ApiNetworkError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('The network request could not be completed.');
    this.name = 'ApiNetworkError';
    this.cause = cause;
  }
}

export class ApiTimeoutError extends ApiNetworkError {
  constructor(cause: unknown) {
    super(cause);
    this.name = 'ApiTimeoutError';
    this.message = 'The request timed out.';
  }
}

export class ApiConfigurationError extends Error {
  constructor() {
    super('EXPO_PUBLIC_API_BASE_URL must be configured.');
    this.name = 'ApiConfigurationError';
  }
}

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | undefined;
let unauthorizedCleanup: Promise<void> | undefined;

/** Registers lifecycle work owned by the app shell before redirecting to the public route group. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | undefined): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<TResponse, TBody = undefined>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let didTimeOut = false;
  const onExternalAbort = () => controller.abort(options.signal?.reason);

  if (options.signal?.aborted) {
    onExternalAbort();
  } else {
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    // Login requests cannot benefit from an existing bearer token. Skipping
    // SecureStore here makes the first sign-in request independent from its
    // read latency (and avoids a needless device-storage operation).
    const token = path.includes('/auth/') ? null : await getAuthToken();
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const hasJsonBody = options.body !== undefined;
    if (hasJsonBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(buildUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: hasJsonBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const problem = await readProblemDetail(response);

      if (response.status === 401 && !path.includes('/auth/')) {
        await handleUnauthorized();
      }

      throw new ProblemDetailError(problem);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as TResponse;
  } catch (error) {
    if (error instanceof ProblemDetailError || error instanceof ApiConfigurationError) {
      throw error;
    }

    // Preserve React Query cancellations instead of presenting them as network failures.
    if (options.signal?.aborted) {
      throw error;
    }

    if (didTimeOut) {
      throw new ApiTimeoutError(error);
    }

    throw new ApiNetworkError(error);
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export const apiClient = {
  get: <TResponse>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse>(path, { ...options, method: 'GET' }),
  post: <TResponse, TBody>(
    path: string,
    body: TBody,
    options?: Omit<ApiRequestOptions<TBody>, 'method' | 'body'>
  ) => apiRequest<TResponse, TBody>(path, { ...options, method: 'POST', body }),
  put: <TResponse, TBody>(
    path: string,
    body: TBody,
    options?: Omit<ApiRequestOptions<TBody>, 'method' | 'body'>
  ) => apiRequest<TResponse, TBody>(path, { ...options, method: 'PUT', body }),
  delete: <TResponse = void>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse>(path, { ...options, method: 'DELETE' }),
};

function buildUrl(path: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    throw new ApiConfigurationError();
  }

  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

async function readProblemDetail(response: Response): Promise<ProblemDetail> {
  const fallback = {
    type: 'about:blank',
    title: response.statusText || 'HTTP error',
    status: response.status,
    detail: `Request failed with status ${response.status}.`,
  } satisfies ProblemDetail;

  try {
    const payload: unknown = await response.json();
    return normalizeProblemDetail(payload, fallback);
  } catch {
    return fallback;
  }
}

function normalizeProblemDetail(value: unknown, fallback: ProblemDetail): ProblemDetail {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const payload = value as Record<string, unknown>;
  return {
    type: typeof payload.type === 'string' ? payload.type : fallback.type,
    title: typeof payload.title === 'string' ? payload.title : fallback.title,
    status: typeof payload.status === 'number' ? payload.status : fallback.status,
    detail: typeof payload.detail === 'string' ? payload.detail : fallback.detail,
    ...(typeof payload.instance === 'string' ? { instance: payload.instance } : {}),
    ...(typeof payload.timestamp === 'string' ? { timestamp: payload.timestamp } : {}),
    ...(Array.isArray(payload.errors)
      ? { errors: payload.errors.filter(isProblemFieldError) }
      : {}),
  };
}

function isProblemFieldError(value: unknown): value is ProblemFieldError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const error = value as Record<string, unknown>;
  return typeof error.field === 'string' && typeof error.message === 'string';
}

async function handleUnauthorized(): Promise<void> {
  if (!unauthorizedCleanup) {
    unauthorizedCleanup = (async () => {
      await clearAuthSession();
      queryClient.clear();
      await unauthorizedHandler?.();
    })().finally(() => {
      unauthorizedCleanup = undefined;
    });
  }

  await unauthorizedCleanup;
}
