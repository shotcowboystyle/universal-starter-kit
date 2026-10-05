const noop = () => {};
const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

/** Returns a cleanup function */
export function onAppFocus(callback: () => void): () => void {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('focus', callback);
  return () => {
    window.removeEventListener('focus', callback);
  };
}

/** Returns a cleanup function */
export function onAppBlur(callback: () => void): () => void {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('blur', callback);
  return () => {
    window.removeEventListener('blur', callback);
  };
}

/** Returns a cleanup function */
export function onOnline(callback: () => void): () => void {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('online', callback);
  return () => {
    window.removeEventListener('online', callback);
  };
}

/** Returns a cleanup function */
export function onOffline(callback: () => void): () => void {
  if (!hasWindow) {
    return noop;
  }
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('offline', callback);
  };
}

/** Returns a cleanup function. Calls back with true when visible, false when hidden. */
export function onVisibilityChange(callback: (visible: boolean) => void): () => void {
  if (!hasDocument) {
    return noop;
  }
  const handler = () => {
    callback(document.visibilityState === 'visible');
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
}
