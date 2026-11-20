const noop = (): void => {
  // intentionally empty
};
const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

/** Returns a cleanup function */
export const onAppFocus = (listener: () => void): (() => void) => {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener('focus', listener);
  };
};

/** Returns a cleanup function */
export const onAppBlur = (listener: () => void): (() => void) => {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('blur', listener);
  return () => {
    window.removeEventListener('blur', listener);
  };
};

/** Returns a cleanup function */
export const onOnline = (listener: () => void): (() => void) => {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('online', listener);
  return () => {
    window.removeEventListener('online', listener);
  };
};

/** Returns a cleanup function */
export const onOffline = (listener: () => void): (() => void) => {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('offline', listener);
  };
};

/** Returns a cleanup function. Calls back with true when visible, false when hidden. */
export const onVisibilityChange = (listener: (visible: boolean) => void): (() => void) => {
  if (!hasDocument) {
    return noop;
  }
  const handler = () => {
    listener(document.visibilityState === 'visible');
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
};
