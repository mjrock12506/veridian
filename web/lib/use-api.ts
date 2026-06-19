"use client";

import * as React from "react";

import { ApiError } from "@/lib/api";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  status: number | null;
}

/** Run an async API call on mount, exposing loading/error/data + a reload(). */
export function useApi<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = React.useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    status: null,
  });

  const run = React.useCallback(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => active && setState({ data, error: null, loading: false, status: 200 }))
      .catch((err) => {
        if (!active) return;
        const status = err instanceof ApiError ? err.status : null;
        setState({ data: null, error: err.message ?? "Request failed", loading: false, status });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(run, [run]);

  return { ...state, reload: run };
}
