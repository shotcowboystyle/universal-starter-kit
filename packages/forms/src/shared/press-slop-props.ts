import { MIN_PRESS_TARGET, pressTargetHitSlop } from '@repo/theme';
import type { HitSlopInsets } from '@repo/theme';
import { isWeb } from 'tamagui';

const PRESS_SLOP_STYLE_ID = 'mp-button-press-slop';

const pressSlopStylesheet = (): string => {
  const rules = ['[data-mp-press-slop]{position:relative;isolation:isolate}'];
  for (let n = 1; n <= 16; n += 1) {
    rules.push(
      `[data-mp-press-slop="${n}"]::after{content:"";position:absolute;inset:-${n}px;z-index:-1}`,
      `[data-mp-press-slop="${n}"][data-mp-press-axis="vertical"]::after{inset:-${n}px 0}`,
    );
  }
  return rules.join('');
};

const ensureButtonPressSlop = (): void => {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${PRESS_SLOP_STYLE_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = PRESS_SLOP_STYLE_ID;
  tag.textContent = pressSlopStylesheet();
  document.head.append(tag);
};

export type PressSlopProps =
  | { 'data-mp-press-slop': string; 'data-mp-press-axis'?: 'vertical' }
  | { hitSlop: HitSlopInsets };

/**
 * The slop channel at a given outset, for a part whose outset is not
 * "whatever reaches 44": a pitch-limited target passes the largest
 * outset that does not cross its neighbor.
 */
export const pressSlopOutsetProps = (
  outset: number,
  axes: 'both' | 'vertical' = 'both',
): PressSlopProps | undefined => {
  const px = Math.floor(outset);
  if (px <= 0) {
    return undefined;
  }
  if (isWeb) {
    ensureButtonPressSlop();
    return {
      'data-mp-press-slop': String(px),
      ...(axes === 'vertical' ? { 'data-mp-press-axis': 'vertical' as const } : undefined),
    };
  }
  const side = axes === 'vertical' ? 0 : px;
  return { hitSlop: { top: px, bottom: px, left: side, right: side } };
};

export const pressSlopProps = (
  visualPx: number,
  enabled: boolean,
  axes: 'both' | 'vertical' = 'both',
): PressSlopProps | undefined => {
  if (!enabled || visualPx >= MIN_PRESS_TARGET) {
    return undefined;
  }
  return pressSlopOutsetProps(pressTargetHitSlop(visualPx).top, axes);
};
