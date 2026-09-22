import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { openSseStream } from '@/src/lib/api-client';
import { queryClient, queryKeys } from '@/src/lib/query-client';
import type { MapStopDetail, StopArrivalsDto, StopLineArrivals } from '@/src/types/api';

type StreamState = { data: StopArrivalsDto | null; error: Error | null; isConnecting: boolean };

export function useStopArrivalsStream(
  stop: MapStopDetail | undefined,
  enabled: boolean
): StreamState {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  const [state, setState] = useState<StreamState>({ data: null, error: null, isConnecting: false });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      setIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !stop || !isActive) {
      return;
    }

    const currentStop = stop;
    let cancelled = false;
    let controller: AbortController | undefined;
    let retryDelay = 1_000;
    const initialData: StopArrivalsDto = {
      identifier: currentStop.identifier,
      latitude: currentStop.latitude,
      longitude: currentStop.longitude,
      lines: [],
    };

    queryClient.removeQueries({
      queryKey: queryKeys.map.arrivals(currentStop.identifier),
      exact: true,
    });
    setState({ data: initialData, error: null, isConnecting: true });
    queryClient.setQueryData(queryKeys.map.arrivals(currentStop.identifier), initialData);

    async function connect(): Promise<void> {
      while (!cancelled) {
        controller = new AbortController();
        try {
          const response = await openSseStream(
            `/api/v1/transit/map/stops/${encodeURIComponent(currentStop.identifier)}/arrivals/stream`,
            controller.signal
          );
          retryDelay = 1_000;
          setState((current) => ({ ...current, error: null, isConnecting: false }));
          await readEvents(response, (event, data) =>
            applyEvent(event, data, initialData, currentStop.identifier)
          );
        } catch (error) {
          if (cancelled || controller.signal.aborted) {
            return;
          }
          setState((current) => ({ ...current, error: toError(error), isConnecting: false }));
          await delay(retryDelay, controller.signal);
          retryDelay = Math.min(retryDelay * 2, 10_000);
        }
      }
    }

    void connect();
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [enabled, isActive, stop]);

  return state;

  function applyEvent(
    event: string,
    payload: unknown,
    initialData: StopArrivalsDto,
    identifier: string
  ): void {
    if (event === 'stream-error' && isStreamError(payload)) {
      setState((current) => ({
        ...current,
        error: new Error(payload.message),
        isConnecting: false,
      }));
      return;
    }

    if (event !== 'line-arrivals' || !isStopLineArrivals(payload)) {
      return;
    }

    setState((current) => {
      const previous = current.data ?? initialData;
      const next = { ...previous, lines: replaceLine(previous.lines, payload) };
      queryClient.setQueryData(queryKeys.map.arrivals(identifier), next);
      return { ...current, data: next, error: null };
    });
  }
}

async function readEvents(
  response: Response,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('SSE stream reader is unavailable.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    frames.forEach((frame) => parseFrame(frame, onEvent));
  }
}

function parseFrame(frame: string, onEvent: (event: string, data: unknown) => void): void {
  const event = frame.match(/^event:\s*(.+)$/m)?.[1];
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!event || !data) return;
  try {
    onEvent(event, JSON.parse(data));
  } catch {
    // Ignore malformed individual events; a later SSE event can correct the state.
  }
}

function replaceLine(lines: StopLineArrivals[], incoming: StopLineArrivals): StopLineArrivals[] {
  const nextByCode = new Map(lines.map((line) => [line.lineCode, line]));
  nextByCode.set(incoming.lineCode, incoming);
  return [...nextByCode.values()];
}

function isStopLineArrivals(value: unknown): value is StopLineArrivals {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { lineCode?: unknown }).lineCode === 'string'
  );
}

function isStreamError(value: unknown): value is { message: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('No se pudo actualizar los arribos de la parada.');
}
