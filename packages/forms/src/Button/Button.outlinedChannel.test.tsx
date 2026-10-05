/**
 * @vitest-environment jsdom
 *
 * The forms Button's outlined chrome cannot be requested through a
 * channel the component ignores.
 *
 * `ButtonFrame` is `styled(View)` and declares only an `outlined` BOOLEAN.
 * `variant="outlined"` was never read, but `ButtonProps` inherited it from
 * `TamaguiButtonProps`, so 75 call sites across 29 files typechecked, rendered
 * FILLED, and said nothing. The type now Omits `variant`, and this spec pins
 * both halves of that: the type refuses it (checked by `tsgo --noEmit`), and
 * the runtime genuinely ignores it, so the refusal is honest rather than
 * cosmetic.
 *
 * jsdom cannot cascade Tamagui CSS — assertions read the atomic border-color
 * classes the FRAME emits, the same idiom as Button.filledBorder.test.tsx.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

function frame(): HTMLElement {
  return screen.getByRole('button');
}

describe('Button outlined channel', () => {
  it('the outlined boolean is the channel, and it paints $borderColor', () => {
    renderWithProviders(<Button outlined>Outlined</Button>);
    expect(frame().className).toMatch(/_btc-borderColor\b/);
  });

  it('the type refuses variant, so a dead pass cannot come back silently', () => {
    // THE GUARD. If someone re-adds `variant` to ButtonProps this stops being
    // an error and `tsgo --noEmit` fails on the unused directive — which is
    // the point: the failure is loud either way.
    // @ts-expect-error `variant` is Omitted from ButtonProps on purpose.
    renderWithProviders(<Button variant="outlined">Refused</Button>);
    // ...and the refusal is honest: it really does render filled.
    expect(frame().className).toMatch(/_btc-transparent\b/);
    expect(frame().className).not.toMatch(/_btc-borderColor\b/);
  });
});
