import { useCallback, useEffect, useRef, useState } from 'react';

// Run an async loader, with loading, error and reload.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: undefined });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (alive.current) setState({ loading: false, error: null, data });
    } catch (error) {
      if (alive.current) setState({ loading: false, error, data: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
