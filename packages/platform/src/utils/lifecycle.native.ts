import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

export const onAppFocus = (listener: () => void): (() => void) => {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      listener();
    }
  });
  return () => {
    sub.remove();
  };
};

export const onAppBlur = (listener: () => void): (() => void) => {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      listener();
    }
  });
  return () => {
    sub.remove();
  };
};

const noop = (): void => {
  // intentionally empty
};

// NetInfo not available without expo-network — no-op for now
export const onOnline = (_listener: () => void): (() => void) => noop;

export const onOffline = (_listener: () => void): (() => void) => noop;

export const onVisibilityChange = (listener: (visible: boolean) => void): (() => void) => {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    listener(state === 'active');
  });
  return () => {
    sub.remove();
  };
};
