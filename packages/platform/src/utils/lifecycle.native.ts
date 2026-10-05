import { AppState, type AppStateStatus } from 'react-native';

export function onAppFocus(callback: () => void): () => void {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      callback();
    }
  });
  return () => {
    sub.remove();
  };
}

export function onAppBlur(callback: () => void): () => void {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      callback();
    }
  });
  return () => {
    sub.remove();
  };
}

export function onOnline(callback: () => void): () => void {
  // NetInfo not available without expo-network — no-op for now
  return () => {};
}

export function onOffline(callback: () => void): () => void {
  return () => {};
}

export function onVisibilityChange(callback: (visible: boolean) => void): () => void {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    callback(state === 'active');
  });
  return () => {
    sub.remove();
  };
}
