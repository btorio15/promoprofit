"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-only localStorage persistence (D-03/D-19). Backs the finder's
 * "Limit hedge amount" checkbox + amount (this plan) and the Arbitrage
 * tab's total-stake/precision controls (Plan 07) -- one small, shared
 * mechanism rather than inventing a second pattern per phase. Persisted
 * values are only form defaults: every submission is re-validated by the
 * same Zod schema client- and server-side (T-01.1-10), and the values
 * themselves are non-sensitive (a boolean and a dollar amount, T-01.1-11).
 */
export const STORAGE_KEYS = {
  finderLimitHedge: "promoprofit.finder.limitHedge",
  finderMaxHedgeAmount: "promoprofit.finder.maxHedgeAmount",
  arbTotalStake: "promoprofit.arb.totalStake",
  arbPrecision: "promoprofit.arb.precision",
} as const;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

/**
 * Reads `key` from `storage`. Returns null when storage is undefined (SSR)
 * or the read throws (e.g. private-browsing mode blocks localStorage).
 */
export function readPersistedString(
  storage: ReadableStorage | undefined,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes `value` to `storage` under `key`, or removes the key when `value`
 * is null. No-ops when storage is undefined; swallows write errors (private
 * mode / quota) since a persisted form default is never load-bearing.
 */
export function writePersistedString(
  storage: WritableStorage | undefined,
  key: string,
  value: string | null,
): void {
  if (!storage) return;
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Private mode / storage quota -- non-fatal, value just won't persist.
  }
}

type Listener = () => void;

// Module-level listener registry, one Set per key, so every component
// reading the same key (e.g. two hook instances) re-renders when either
// writes it, without lifting state up.
const listeners = new Map<string, Set<Listener>>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);

  // Cross-tab/window sync: the native "storage" event fires in *other*
  // tabs/windows when this key changes (never in the tab that wrote it).
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Reads/writes a single localStorage key, backed by useSyncExternalStore so
 * it is SSR-safe (getServerSnapshot returns null, matching the server's
 * "nothing persisted yet" render) and lint-safe (no setState-inside-effect
 * pattern). Returns `defaultValue` until a real value has been persisted.
 */
export function usePersistentString(
  key: string,
  defaultValue: string,
): [value: string, setValue: (next: string) => void] {
  const getSnapshot = useCallback(
    () => readPersistedString(typeof window === "undefined" ? undefined : window.localStorage, key),
    [key],
  );
  const getServerSnapshot = useCallback(() => null, []);
  const subscribeToKey = useCallback((listener: Listener) => subscribe(key, listener), [key]);

  const stored = useSyncExternalStore(subscribeToKey, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: string) => {
      writePersistedString(
        typeof window === "undefined" ? undefined : window.localStorage,
        key,
        next,
      );
      notify(key);
    },
    [key],
  );

  return [stored ?? defaultValue, setValue];
}
