import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { AuthUser } from '../auth';

const STORAGE_PREFIX = 'hub_nav_usage_';

type UsageMap = Record<string, number>;

function storageKey(user: AuthUser | null): string {
  return `${STORAGE_PREFIX}${user?.id ?? 'anon'}`;
}

function readUsage(user: AuthUser | null): UsageMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(user));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UsageMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsage(user: AuthUser | null, usage: UsageMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(user), JSON.stringify(usage));
}

let listeners: Array<() => void> = [];
let cachedUserId: string | null = null;
let cachedUsage: UsageMap = {};

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

function syncCache(user: AuthUser | null) {
  const uid = user?.id ?? 'anon';
  if (uid !== cachedUserId) {
    cachedUserId = uid;
    cachedUsage = readUsage(user);
  }
}

export function useNavRecents(user: AuthUser | null) {
  syncCache(user);

  const usage = useSyncExternalStore(
    subscribe,
    () => {
      syncCache(user);
      return cachedUsage;
    },
    () => ({})
  );

  const recordViewVisit = useCallback(
    (view: string) => {
      if (!view || view === 'hub') return;
      syncCache(user);
      cachedUsage = {
        ...cachedUsage,
        [view]: (cachedUsage[view] ?? 0) + 1,
      };
      writeUsage(user, cachedUsage);
      notify();
    },
    [user]
  );

  const usageMap = useMemo(() => usage, [usage]);

  return { usage: usageMap, recordViewVisit };
}
