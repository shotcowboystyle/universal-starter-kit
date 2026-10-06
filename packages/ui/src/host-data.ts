type HostDataProps = Record<string, string> | { dataSet: Record<string, string> };

/**
 * Tamagui styled hosts drop JSX `data-*` on native (Toast gallery hole), so
 * native needs the RN `dataSet` map. On web, spreading `dataSet` onto a DOM
 * host is a React invalid-prop warning (`dataSet` → `dataset`) and is what
 * the knob-fuzz harness recorded as a probe/console failure on every
 * consumer. jsdom and Storybook both keep kebab `data-*`, so web writes
 * those only.
 */
export const hostData = (attrs: Record<string, string>): HostDataProps => {
  if (process.env.TAMAGUI_TARGET !== 'native') {
    return attrs;
  }
  const dataSet: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const camel = key.replace(/^data-/u, '').replaceAll(/-(?<letter>[a-z])/gu, (_, c: string) => c.toUpperCase());
    dataSet[camel] = value;
  }
  return { dataSet };
};
