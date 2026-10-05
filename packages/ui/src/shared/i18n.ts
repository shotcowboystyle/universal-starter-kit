import * as ReactI18next from 'react-i18next';

/**
 * react-i18next is an OPTIONAL peer: apps that never render the i18n-using
 * catalog components (Alert, Toast, Carousel, views/, layouts/, …) may omit
 * it entirely and tree-shake those components away. When it is missing, the
 * bundler substitutes an empty optional-peer-dep stub for the package —
 * direct named imports would then surface as dozens of cryptic
 * MISSING_EXPORT warnings and undefined-call crashes far from the cause.
 * Every catalog usage routes through this namespace access instead, so
 * omission stays warning-free for tree-shakers and fails loudly — naming the
 * package and the fix — the moment an i18n-using component actually renders.
 */
export const useTranslation = ((...args: unknown[]) => {
  const impl = (ReactI18next as { useTranslation?: (...args: unknown[]) => unknown }).useTranslation;
  if (typeof impl !== 'function') {
    throw new Error(
      '[@repo/ui] react-i18next is not installed, but a component that ' +
        'translates its built-in copy was rendered. Add react-i18next and i18next to your ' +
        "app's dependencies (they are optional peers so apps that never render these " +
        'components can omit them).',
    );
  }
  return impl(...args);
}) as typeof ReactI18next.useTranslation;
