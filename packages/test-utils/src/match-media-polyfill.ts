import 'matchmedia-polyfill';

const noop = () => {
  // Intentionally empty: stub for listener APIs the polyfill omits.
};

// matchmedia-polyfill (jsdom) omits the listener API Tamagui's media driver
// subscribes with. Tamagui captures window.matchMedia at module load, so this
// module must be imported before anything that pulls in tamagui.
const baseMatchMedia = window.matchMedia?.bind(window);
window.matchMedia = (query: string) => {
  const mql = baseMatchMedia?.(query) ?? ({ matches: false, media: query } as MediaQueryList);
  return Object.assign(mql, {
    // oxlint-disable-next-line typescript/unbound-method, typescript/no-deprecated -- legacy API being polyfilled; reassigned onto same mql
    addListener: mql.addListener ?? noop,
    // oxlint-disable-next-line typescript/unbound-method, typescript/no-deprecated -- legacy API being polyfilled; reassigned onto same mql
    removeListener: mql.removeListener ?? noop,
    // oxlint-disable-next-line typescript/unbound-method -- reassigned onto same mql
    addEventListener: mql.addEventListener ?? noop,
    // oxlint-disable-next-line typescript/unbound-method -- reassigned onto same mql
    removeEventListener: mql.removeEventListener ?? noop,
  });
};
