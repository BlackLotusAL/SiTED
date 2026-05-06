import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface StaleResourceCacheEntry<T> {
  data: T;
}

interface StaleResourceOptions<T> {
  key: string;
  load: () => Promise<T>;
  enabled?: boolean;
}

interface StaleResourceState<T> {
  key: string;
  enabled: boolean;
  data: T | undefined;
  error: Error | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
}

export interface StaleResource<T> {
  data: T | undefined;
  error: Error | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<T | undefined>;
  setData: (updater: T | ((current: T | undefined) => T)) => void;
}

const staleResourceCache = new Map<string, StaleResourceCacheEntry<unknown>>();

export function useStaleResource<T>({ key, load, enabled = true }: StaleResourceOptions<T>): StaleResource<T> {
  const loadRef = useRef(load);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<StaleResourceState<T>>(() => initialStateForKey<T>(key, enabled));

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const visibleState = state.key === key && state.enabled === enabled ? state : initialStateForKey<T>(key, enabled);

  const setData = useCallback(
    (updater: T | ((current: T | undefined) => T)) => {
      const current = readCachedResource<T>(key) ?? (state.key === key ? state.data : undefined);
      const nextData = typeof updater === "function" ? (updater as (current: T | undefined) => T)(current) : updater;
      staleResourceCache.set(key, { data: nextData });
      setState({
        key,
        enabled,
        data: nextData,
        error: null,
        isInitialLoading: false,
        isRefreshing: false
      });
    },
    [enabled, key, state.data, state.key]
  );

  const refresh = useCallback(async (): Promise<T | undefined> => {
    if (!enabled) {
      setState({
        key,
        enabled,
        data: undefined,
        error: null,
        isInitialLoading: false,
        isRefreshing: false
      });
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cachedData = readCachedResource<T>(key);

    setState((current) => {
      if (cachedData !== undefined && current.key !== key) {
        return current;
      }

      return {
        key,
        enabled,
        data: cachedData,
        error: null,
        isInitialLoading: cachedData === undefined,
        isRefreshing: cachedData !== undefined
      };
    });

    try {
      const nextData = await loadRef.current();
      if (requestIdRef.current === requestId) {
        staleResourceCache.set(key, { data: nextData });
        setState({
          key,
          enabled,
          data: nextData,
          error: null,
          isInitialLoading: false,
          isRefreshing: false
        });
      }
      return nextData;
    } catch (error) {
      const retainedData = readCachedResource<T>(key) ?? cachedData;
      if (requestIdRef.current === requestId) {
        setState({
          key,
          enabled,
          data: retainedData,
          error: normalizeError(error),
          isInitialLoading: false,
          isRefreshing: false
        });
      }
      return undefined;
    }
  }, [enabled, key]);

  useEffect(() => {
    void refresh();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return useMemo(
    () => ({
      data: visibleState.data,
      error: visibleState.error,
      isInitialLoading: visibleState.isInitialLoading,
      isRefreshing: visibleState.isRefreshing,
      refresh,
      setData
    }),
    [refresh, setData, visibleState.data, visibleState.error, visibleState.isInitialLoading, visibleState.isRefreshing]
  );
}

export function clearStaleResourceCache(): void {
  staleResourceCache.clear();
}

export function invalidateStaleResource(prefix: string): void {
  for (const key of staleResourceCache.keys()) {
    if (key.startsWith(prefix)) {
      staleResourceCache.delete(key);
    }
  }
}

export function setStaleResourceData<T>(key: string, updater: T | ((current: T | undefined) => T)): T {
  const current = readCachedResource<T>(key);
  const nextData = typeof updater === "function" ? (updater as (current: T | undefined) => T)(current) : updater;
  staleResourceCache.set(key, { data: nextData });
  return nextData;
}

function initialStateForKey<T>(key: string, enabled: boolean): StaleResourceState<T> {
  if (!enabled) {
    return {
      key,
      enabled,
      data: undefined,
      error: null,
      isInitialLoading: false,
      isRefreshing: false
    };
  }

  const cachedData = readCachedResource<T>(key);
  return {
    key,
    enabled,
    data: cachedData,
    error: null,
    isInitialLoading: cachedData === undefined,
    isRefreshing: cachedData !== undefined
  };
}

function readCachedResource<T>(key: string): T | undefined {
  return staleResourceCache.get(key)?.data as T | undefined;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Resource request failed");
}
