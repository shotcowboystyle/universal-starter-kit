import 'matchmedia-polyfill';

// matchmedia-polyfill (jsdom) omits the listener API Tamagui's media driver
// subscribes with. Tamagui captures window.matchMedia at module load, so this
// module must be imported before anything that pulls in tamagui.
const baseMatchMedia = window.matchMedia?.bind(window);
window.matchMedia = (query: string) => {
  const mql = baseMatchMedia?.(query) ?? ({ matches: false, media: query } as MediaQueryList);
  const noop = () => {};
  return Object.assign(mql, {
    addListener: mql.addListener ?? noop,
    removeListener: mql.removeListener ?? noop,
    addEventListener: mql.addEventListener ?? noop,
    removeEventListener: mql.removeEventListener ?? noop,
  });
};
