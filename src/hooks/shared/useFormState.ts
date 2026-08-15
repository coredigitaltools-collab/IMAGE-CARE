// ============================================================
// IMC-BLD-005 | ImageCare ERP State & Data Flow v1.0
// File: src/hooks/shared/useFormState.ts
// Purpose: Standardized form state management.
//          Handles dirty tracking, submission prevention,
//          field-level errors, and unsaved changes warning.
//          Every form in every module uses this pattern.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { ServiceErrorCode } from '../../types/contracts';

// ---- Form State --------------------------------------------

export interface FormState<T> {
  values:     T;
  errors:     Partial<Record<keyof T, string>>;
  isDirty:    boolean;
  isSubmitting: boolean;
  submitError:  string | null;
  submitErrorCode: ServiceErrorCode | null;
  isSuccess:    boolean;
}

export interface FormActions<T> {
  setValue:     (field: keyof T, value: T[keyof T]) => void;
  setValues:    (values: Partial<T>) => void;
  setError:     (field: keyof T, error: string) => void;
  clearError:   (field: keyof T) => void;
  clearErrors:  () => void;
  reset:        () => void;
  setSubmitting:(isSubmitting: boolean) => void;
  setSubmitError: (error: string | null, code?: ServiceErrorCode | null) => void;
  setSuccess:   () => void;
}

export function useFormState<T extends object>(
  initialValues: T
): FormState<T> & FormActions<T> {
  const initial = useRef(initialValues);

  const [values,     setValuesState]  = useState<T>(initialValues);
  const [errors,     setErrors]       = useState<Partial<Record<keyof T, string>>>({});
  const [isDirty,    setIsDirty]      = useState(false);
  const [isSubmitting, setIsSubmittingState] = useState(false);
  const [submitError,  setSubmitErrorState]  = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCodeState] = useState<ServiceErrorCode | null>(null);
  const [isSuccess,  setIsSuccessState] = useState(false);

  const setValue = useCallback((field: keyof T, value: T[keyof T]) => {
    setValuesState(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setIsSuccessState(false);
    // Clear field error on change
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setValues = useCallback((updates: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  const setError = useCallback((field: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }));
  }, []);

  const clearError = useCallback((field: keyof T) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  const reset = useCallback(() => {
    setValuesState(initial.current);
    setErrors({});
    setIsDirty(false);
    setIsSubmittingState(false);
    setSubmitErrorState(null);
    setSubmitErrorCodeState(null);
    setIsSuccessState(false);
  }, []);

  const setSubmitting = useCallback((submitting: boolean) => {
    setIsSubmittingState(submitting);
    if (submitting) {
      setSubmitErrorState(null);
      setSubmitErrorCodeState(null);
      setIsSuccessState(false);
    }
  }, []);

  const setSubmitError = useCallback((
    error: string | null,
    code?: ServiceErrorCode | null
  ) => {
    setSubmitErrorState(error);
    setSubmitErrorCodeState(code ?? null);
    setIsSubmittingState(false);
  }, []);

  const setSuccess = useCallback(() => {
    setIsSuccessState(true);
    setIsSubmittingState(false);
    setSubmitErrorState(null);
    setIsDirty(false);
  }, []);

  return {
    values, errors, isDirty, isSubmitting,
    submitError, submitErrorCode, isSuccess,
    setValue, setValues, setError, clearError,
    clearErrors, reset, setSubmitting, setSubmitError, setSuccess,
  };
}

// ---- Form Validation Helpers -------------------------------

export type ValidationRule<T> = (value: T, values?: unknown) => string | null;

export interface FieldRules<T extends object> {
  [K: string]: ValidationRule<T[keyof T]>[];
}

export function validateForm<T extends object>(
  values: T,
  rules: Partial<{ [K in keyof T]: ValidationRule<T[K]>[] }>
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};

  for (const field in rules) {
    const fieldRules = rules[field as keyof T];
    if (!fieldRules) continue;

    for (const rule of fieldRules) {
      const error = rule(values[field as keyof T] as T[keyof T], values);
      if (error) {
        errors[field as keyof T] = error;
        break; // First error only per field
      }
    }
  }

  return errors;
}

// Common validation rules
export const rules = {
  required: (label: string): ValidationRule<unknown> =>
    (value) => {
      if (value === null || value === undefined || value === '') {
        return `${label} is required.`;
      }
      return null;
    },

  minLength: (min: number, label: string): ValidationRule<string> =>
    (value) => {
      if (typeof value === 'string' && value.length < min) {
        return `${label} must be at least ${min} characters.`;
      }
      return null;
    },

  positiveNumber: (label: string): ValidationRule<number> =>
    (value) => {
      if (typeof value !== 'number' || value <= 0) {
        return `${label} must be greater than zero.`;
      }
      return null;
    },

  nonNegativeNumber: (label: string): ValidationRule<number> =>
    (value) => {
      if (typeof value !== 'number' || value < 0) {
        return `${label} cannot be negative.`;
      }
      return null;
    },

  email: (): ValidationRule<string> =>
    (value) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Please enter a valid email address.';
      }
      return null;
    },

  phone: (): ValidationRule<string> =>
    (value) => {
      if (value && !/^[\d\s+\-()]{7,15}$/.test(value)) {
        return 'Please enter a valid phone number.';
      }
      return null;
    },

  maxAmount: (max: number, label: string): ValidationRule<number> =>
    (value) => {
      if (typeof value === 'number' && value > max) {
        return `${label} cannot exceed ${max.toLocaleString()}.`;
      }
      return null;
    },
};

// ---- Unsaved Changes Guard ---------------------------------
// Use in pages with forms that may have unsaved changes.

export function useUnsavedChangesGuard(isDirty: boolean) {
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }, [isDirty]);

  return { handleBeforeUnload };
}

// ---- Duplicate Submission Prevention -----------------------
// Tracks in-flight mutations to prevent double submits.

export function useMutationGuard() {
  const inFlightRef = useRef<Set<string>>(new Set());

  const guard = useCallback(<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> | null => {
    if (inFlightRef.current.has(key)) {
      console.warn(`Duplicate submission prevented for: ${key}`);
      return null;
    }

    inFlightRef.current.add(key);
    return fn().finally(() => {
      inFlightRef.current.delete(key);
    });
  }, []);

  return { guard };
}
