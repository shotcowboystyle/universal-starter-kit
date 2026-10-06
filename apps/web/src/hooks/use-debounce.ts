import { useEffect, useState } from 'react';

import { DEBOUNCE_DELAY_MS } from '@/constants/common';

export const useDebounce = <T>(value: T, delay?: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setDebouncedValue(value);
      },
      delay === undefined || delay === 0 ? DEBOUNCE_DELAY_MS : delay,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};
