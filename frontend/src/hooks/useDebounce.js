import { useState, useEffect } from 'react';

/**
 * Debounce a value by a given delay.
 * Useful for search inputs, live filtering, etc.
 *
 * @param {*} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default 300ms)
 * @returns {*} Debounced value
 */
export const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};
