import { useState, useEffect } from 'react';

/**
 * Debounces a value. Useful for search inputs to avoid excessive filtering/re-renders.
 * @param value - The value to debounce
 * @param delay - Delay in ms (default 300)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
