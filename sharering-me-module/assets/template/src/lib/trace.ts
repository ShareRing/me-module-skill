/**
 * A live record of every message this module exchanges with ShareRing Me.
 *
 * It wraps the SDK's transport (the real WebView one, or the dev mock) rather than the call
 * wrappers, so it sees exactly what goes over the bridge: the event type, the payload, the reply
 * and the round-trip time. The "Behind the scenes" console and every experiment's trace read it.
 *
 * Privacy: entries live in memory on the phone only. Nothing here is ever posted to the server.
 */
import { FIRE_AND_FORGET, CATEGORY_OF, type Transport } from '@sharering/me-module-sdk';
import { decodeRequest, decodeResponse } from '@sharering/me-module-sdk/protocol';
import { useSyncExternalStore } from 'react';

export type TraceStatus = 'pending' | 'ok' | 'error' | 'sent';

export interface TraceEntry {
  /** Monotonic, starts at 1. Use it as a mark: entries with id > mark happened after it. */
  id: number;
  type: string;
  category: string;
  /** performance.now() when the request left. */
  t0: number;
  /** Wall-clock time the request left (ms since epoch). */
  at: number;
  status: TraceStatus;
  /** Round trip in ms, once answered. */
  ms?: number;
  request?: unknown;
  response?: unknown;
  error?: unknown;
  requestId?: string;
}

const MAX = 400;
let entries: TraceEntry[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const update = (id: number, patch: Partial<TraceEntry>) => {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
};

/** The id of the newest entry: pass it to `since()` / `useTraceSince()` to watch what happens next. */
export const traceMark = () => seq;
export const getTrace = () => entries;
export const since = (mark: number) => entries.filter((e) => e.id > mark);

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useTrace = () => useSyncExternalStore(subscribe, getTrace);

/** Entries after `mark` (stable between changes, so it is safe in render). */
export function useTraceSince(mark: number) {
  const all = useTrace();
  return sinceCache(all, mark);
}
let lastAll: TraceEntry[] | null = null;
let lastMark = -1;
let lastOut: TraceEntry[] = [];
function sinceCache(all: TraceEntry[], mark: number) {
  if (all !== lastAll || mark !== lastMark) {
    lastAll = all;
    lastMark = mark;
    lastOut = all.filter((e) => e.id > mark);
  }
  return lastOut;
}

/** Wraps a transport so every request and reply is recorded. */
export function traced(inner: Transport): Transport {
  // Replies are matched by requestId when the app echoes one, otherwise first-in-first-out per
  // type (the SDK sends same-type requests one at a time when it can't correlate).
  const pendingById = new Map<string, number>();
  const pendingByType = new Map<string, number[]>();
  return {
    ready: () => inner.ready(),
    isHosted: () => inner.isHosted(),
    post(raw: string) {
      const req = decodeRequest(raw);
      if (req) {
        const id = ++seq;
        const ff = FIRE_AND_FORGET.has(req.type as never);
        const entry: TraceEntry = {
          id,
          type: req.type,
          category: (CATEGORY_OF as Record<string, string>)[req.type] ?? 'OTHER',
          t0: performance.now(),
          at: Date.now(),
          status: ff ? 'sent' : 'pending',
          request: req.payload,
          requestId: req.requestId,
        };
        entries = [...entries.slice(-(MAX - 1)), entry];
        if (!ff) {
          if (req.requestId) pendingById.set(req.requestId, id);
          else pendingByType.set(req.type, [...(pendingByType.get(req.type) ?? []), id]);
        }
        emit();
      }
      inner.post(raw);
    },
    subscribe(onMessage) {
      return inner.subscribe((raw, source) => {
        try {
          const res = decodeResponse(raw);
          if (res) {
            let id: number | undefined;
            if (res.requestId && pendingById.has(res.requestId)) {
              id = pendingById.get(res.requestId);
              pendingById.delete(res.requestId);
            } else {
              const q = pendingByType.get(res.type);
              if (q?.length) {
                id = q.shift();
                pendingByType.set(res.type, q);
              }
            }
            const e = id !== undefined ? entries.find((x) => x.id === id) : undefined;
            if (e && e.status === 'pending') {
              update(e.id, {
                status: res.error !== undefined ? 'error' : 'ok',
                ms: Math.max(0, Math.round(performance.now() - e.t0)),
                response: res.payload,
                error: res.error,
              });
            }
          }
        } catch {
          /* never let tracing break the bridge */
        }
        onMessage(raw, source);
      });
    },
  };
}

/** Shortens big values (avatars, long strings) for display. */
export function preview(v: unknown, max = 900): string {
  if (v === undefined) return '';
  let s: string;
  try {
    s = JSON.stringify(
      v,
      (_k, x) => (typeof x === 'string' && x.length > 120 ? `${x.slice(0, 64)}… (${x.length} chars)` : x),
      2,
    );
  } catch {
    s = String(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
