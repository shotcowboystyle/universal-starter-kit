export type TintListener = (next: boolean) => void;

export const listeners = new Set<TintListener>();

// oxlint-disable-next-line import/no-mutable-exports -- consumers read the live binding after setTinted()
export let isTinted = true;

export const setTinted = (next: boolean) => {
  isTinted = next;
  // oxlint-disable-next-line sonarjs/no-empty-collection -- listeners is a public registry populated by consumers (and tests)
  for (const listener of listeners) {
    listener(next);
  }
};

export const toggleTinted = () => {
  setTinted(!isTinted);
};
