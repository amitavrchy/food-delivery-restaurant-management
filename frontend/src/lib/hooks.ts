'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useApp } from '@/components/provider';
export function useResource<T>(path: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, loading, setData };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const { notify, refresh } = useApp();
  const run = useCallback(
    async <T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      if (busy) return;
      setBusy(true);
      try {
        const result = await fn();
        if (success) notify(success);
        refresh();
        return result;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Something went wrong.', true);
      } finally {
        setBusy(false);
      }
    },
    [busy, notify, refresh],
  );
  return { busy, run };
}
