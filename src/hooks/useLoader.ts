import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';

export interface LoaderState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Wraps an async read. Nothing runs on mount: screens call `reload` from
 * useFocusEffect, so the data is fresh every time the screen is shown.
 * Only the latest call may update state, so a slow earlier response cannot
 * overwrite a newer one.
 */
export function useLoader<T>(load: () => Promise<T>): LoaderState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestCall = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latestCall.current;
    setLoading(true);
    try {
      const result = await load();
      if (call === latestCall.current) {
        setData(result);
        setError(null);
      }
    } catch (caught) {
      if (call === latestCall.current) {
        setError(errorMessage(caught, 'Não foi possível carregar os dados.'));
      }
    } finally {
      if (call === latestCall.current) {
        setLoading(false);
      }
    }
  }, [load]);

  return { data, error, loading, reload };
}
