// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/hooks/shared/useServiceCall.ts
// Purpose: Standardized hook for service calls.
//          Every service call in every module uses this pattern.
//          Handles loading, error, success, and retry consistently.
//          Never write ad-hoc fetch/loading/error logic in components.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { ServiceResponse } from '../../types/contracts';

// ---- State shape -------------------------------------------

export interface ServiceCallState<T> {
  data:      T | null;
  isLoading: boolean;
  error:     string | null;
  errorCode: string | null;
  isSuccess: boolean;
}

export interface ServiceCallActions<T, TArgs extends unknown[]> {
  execute:  (...args: TArgs) => Promise<ServiceResponse<T>>;
  reset:    () => void;
  setData:  (data: T) => void;
}

// ---- Hook --------------------------------------------------

export function useServiceCall<T, TArgs extends unknown[]>(
  serviceFn: (...args: TArgs) => Promise<ServiceResponse<T>>
): ServiceCallState<T> & ServiceCallActions<T, TArgs> {
  const [state, setState] = useState<ServiceCallState<T>>({
    data:      null,
    isLoading: false,
    error:     null,
    errorCode: null,
    isSuccess: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (...args: TArgs): Promise<ServiceResponse<T>> => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error:     null,
      errorCode: null,
      isSuccess: false,
    }));

    try {
      const result = await serviceFn(...args);

      setState({
        data:      result.data,
        isLoading: false,
        error:     result.success ? null : (result.error?.message ?? 'An error occurred.'),
        errorCode: result.success ? null : (result.error?.code ?? null),
        isSuccess: result.success,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setState({
        data:      null,
        isLoading: false,
        error:     message,
        errorCode: 'INTERNAL_ERROR',
        isSuccess: false,
      });

      return {
        success:          false,
        data:             null,
        error:            { code: 'INTERNAL_ERROR', message },
        request_id:       '',
        server_timestamp: new Date().toISOString(),
      };
    }
  }, [serviceFn]);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null, errorCode: null, isSuccess: false });
  }, []);

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, data, isSuccess: true }));
  }, []);

  return { ...state, execute, reset, setData };
}

// ---- Async data loader (runs on mount / dependency change) -

import { useEffect } from 'react';

export function useAsyncData<T, TArgs extends unknown[]>(
  serviceFn: (...args: TArgs) => Promise<ServiceResponse<T>>,
  args: TArgs,
  deps: unknown[] = []
): ServiceCallState<T> & { refetch: () => void } {
  const { execute, reset, setData, ...state } = useServiceCall<T, TArgs>(serviceFn);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    execute(...args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, trigger]);

  const refetch = useCallback(() => setTrigger(t => t + 1), []);

  return { ...state, execute, reset, setData, refetch };
}
