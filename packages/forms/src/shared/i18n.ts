// oxlint-disable-next-line sonarjs/no-wildcard-import -- namespace access is the point: named imports break when the optional peer is stubbed (see below)
import * as ReactI18next from 'react-i18next';

/**
 * react-i18next is an OPTIONAL peer: apps that never render the i18n-using
 * fields may omit it entirely and tree-shake them away. When it is missing,
 * the bundler substitutes an empty optional-peer-dep stub for the package —
 * direct named imports would then surface as cryptic MISSING_EXPORT failures
 * far from the cause. Route every usage through this namespace access
 * instead, so omission stays warning-free for tree-shakers and fails loudly —
 * naming the package and the fix — the moment an i18n-using field actually
 * renders.
 */
// SAFETY: the wrapper forwards its arguments and result to the real hook unchanged, so it has the hook's own signature.
export const useTranslation = ((...args: Parameters<typeof ReactI18next.useTranslation>) => {
  // SAFETY: widening only; when the optional peer is stubbed the namespace has no useTranslation, so it can be undefined at runtime.
  const impl = ReactI18next.useTranslation as typeof ReactI18next.useTranslation | undefined;
  if (impl === undefined) {
    throw new TypeError(
      '[@repo/forms] react-i18next is not installed, but a component that ' +
        'translates its built-in copy was rendered. Add react-i18next and i18next to your ' +
        "app's dependencies (they are optional peers so apps that never render these " +
        'components can omit them).',
    );
  }
  return impl(...args);
}) as typeof ReactI18next.useTranslation;
