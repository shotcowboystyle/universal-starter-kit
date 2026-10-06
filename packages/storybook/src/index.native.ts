/**
 * `@storybook/addon-ondevice-actions` registers the panel but does not export `action`.
 * `storybook/actions` is browser-bundled and breaks under Metro. Mirror the `action(name)`
 * helper so shared `.stories.tsx` work on Expo Storybook.
 */
export const action =
  (name: string) =>
  (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[Storybook action "${name}"]`, ...args);
    }
  };
