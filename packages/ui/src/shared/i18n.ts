// oxlint-disable-next-line sonarjs/no-wildcard-import -- namespace access is the point: a named import of a missing optional peer fails far from the cause
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
// SAFETY: the wrapper forwards its arguments and return value untouched, so it keeps every overload of the real hook.
export const useTranslation = ((...args: Parameters<typeof ReactI18next.useTranslation>) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the optional-peer stub makes this export undefined at runtime despite its static type
  if (typeof ReactI18next.useTranslation !== 'function') {
    throw new TypeError(
      '[@repo/ui] react-i18next is not installed, but a component that ' +
        'translates its built-in copy was rendered. Add react-i18next and i18next to your ' +
        "app's dependencies (they are optional peers so apps that never render these " +
        'components can omit them).',
    );
  }
  return ReactI18next.useTranslation(...args);
}) as typeof ReactI18next.useTranslation;
