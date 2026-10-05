import { useResolvedKnobs } from '@repo/theme';
import { View, isWeb } from 'tamagui';

import { t } from '../shared/t';

import { SpinnerGlyph, useSpinnerStroke } from './SpinnerGlyph';
import { spinnerSizePx, spinnerSizeToken, type SpinnerProps } from './spinnerSize';

export type { SpinnerProps, SpinnerSize } from './spinnerSize';

const MOTION_STYLE_ID = 'mp1-spinner-motion';
// A-CONTINUOUS period. Gated on `knobProps.transition`; not sourced
// from A-STATE durations (quick=100ms would strobe).
const SPIN_PERIOD = '0.7s';

function ensureMotionStyles() {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(MOTION_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = MOTION_STYLE_ID;
  style.textContent = [
    '@keyframes mp1-spinner-spin { to { transform: rotate(360deg) } }',
    `.mp1-spinner { animation: mp1-spinner-spin ${SPIN_PERIOD} linear infinite; }`,
    '.mp1-spinner-static, .mp1-spinner-static * { animation: none !important; }',
    '@media (prefers-reduced-motion: reduce) { .mp1-spinner, .mp1-spinner * { animation: none !important; } }',
  ].join('\n');
  document.head.appendChild(style);
}

/** Form-styled Spinner. Size follows the shared size-token scale; spin gates on transition. */
export function Spinner({ size, color, ...props }: SpinnerProps) {
  const { knobProps } = useResolvedKnobs();
  const token = spinnerSizeToken(size, knobProps.sizeToken);
  const px = spinnerSizePx(token);
  const stroke = useSpinnerStroke(color);
  const animationsOff = !knobProps.transition;
  ensureMotionStyles();
  const { className: classNameProp, ...rest } = props as { className?: string };
  const className = ['mp1-spinner', animationsOff ? 'mp1-spinner-static' : '', classNameProp].filter(Boolean).join(' ');
  return (
    <View
      width={px}
      height={px}
      role="status"
      aria-label={t('Loading')}
      aria-live="polite"
      aria-busy
      pointerEvents="none"
      data-size={token}
      data-animation={animationsOff ? 'none' : 'spin'}
      {...(isWeb ? { className } : undefined)}
      {...rest}>
      <SpinnerGlyph color={stroke} size={px} />
    </View>
  );
}
