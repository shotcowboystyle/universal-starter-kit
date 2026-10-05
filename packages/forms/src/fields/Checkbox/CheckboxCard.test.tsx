import { renderWithProviders } from '@repo/test-utils';
/**
 * CheckboxCard — the SELECTION-CARD anatomy and its two derivations.
 *
 * These five parts are shared by `Checkboxes.Card`, `CheckboxGroup card` and
 * `RadioGroup card`, so a change here moves three surfaces at once and nothing
 * checked it. The two rules worth pinning are "selected = fill, not an
 * extra border" and "the description is one step under the field
 * size" — both are one-line edits away from silently regressing.
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CheckboxCardContent,
  CheckboxCardDescription,
  CheckboxCardFrame,
  CheckboxCardLabel,
  getCardDescriptionSize,
  getCheckboxCardLayout,
} from './CheckboxCard';

afterEach(cleanup);

/**
 * The styled parts paint through Tamagui atomic classes, so the class list is
 * the honest read; `getComputedStyle` only resolves the subset whose CSS this
 * environment injects.
 */
function classesOf(node: Element | null): string {
  if (!node) {
    throw new Error('expected a rendered node');
  }
  return Array.from(node.classList).join(' ');
}

function painted(container: HTMLElement, marker: string): string {
  return classesOf(container.querySelector(`[class*='${marker}']`));
}

describe('getCardDescriptionSize — T-HELPER is one step under the field', () => {
  it('maps each field size onto its helper tier', () => {
    expect(getCardDescriptionSize('$1')).toBe('$1');
    expect(getCardDescriptionSize('$2')).toBe('$1');
    expect(getCardDescriptionSize('$3')).toBe('$2');
    expect(getCardDescriptionSize('$4')).toBe('$3');
    expect(getCardDescriptionSize('$5')).toBe('$4');
    expect(getCardDescriptionSize('$6')).toBe('$5');
  });

  it('treats $true as the default field size, not as an unknown', () => {
    expect(getCardDescriptionSize('$true' as never)).toBe('$3');
    expect(getCardDescriptionSize('$true' as never)).toBe(getCardDescriptionSize('$4'));
  });

  it('falls back to $2 for no size and for a size off the ladder', () => {
    expect(getCardDescriptionSize(undefined)).toBe('$2');
    expect(getCardDescriptionSize('$9' as never)).toBe('$2');
  });

  it('never returns a helper size at or above its own field size', () => {
    for (const [field, helper] of [
      ['$3', '$2'],
      ['$4', '$3'],
      ['$5', '$4'],
      ['$6', '$5'],
    ] as const) {
      expect(getCardDescriptionSize(field), field).toBe(helper);
      expect(Number(String(helper).slice(1))).toBeLessThan(Number(field.slice(1)));
    }
  });
});

describe('getCheckboxCardLayout — compact metrics off the space knob', () => {
  it('gives each space stop its own padding and gap', () => {
    expect(getCheckboxCardLayout('none')).toEqual({
      paddingVertical: '$2.5',
      paddingHorizontal: '$3',
      gap: '$2.5',
    });
    expect(getCheckboxCardLayout('large')).toEqual({
      paddingVertical: '$3.5',
      paddingHorizontal: '$4',
      gap: '$3.5',
    });
  });

  it('makes small and medium deliberately identical', () => {
    expect(getCheckboxCardLayout('small')).toEqual(getCheckboxCardLayout('medium'));
  });

  it('falls back to medium for an unknown stop rather than throwing', () => {
    expect(getCheckboxCardLayout('enormous')).toEqual(getCheckboxCardLayout('medium'));
    expect(getCheckboxCardLayout('')).toEqual(getCheckboxCardLayout('medium'));
  });

  it('grows monotonically from none to large', () => {
    const stops = ['none', 'small', 'large'].map((s) => getCheckboxCardLayout(s));
    const num = (token: string) => Number(token.replace('$', ''));
    expect(num(stops[0].paddingVertical)).toBeLessThanOrEqual(num(stops[1].paddingVertical));
    expect(num(stops[1].paddingVertical)).toBeLessThan(num(stops[2].paddingVertical));
  });
});

describe('CheckboxCardFrame — control leading, whole card interactive', () => {
  it('lays the control out in a row, top-aligned with the first label line', () => {
    const { container } = renderWithProviders(<CheckboxCardFrame />);
    const card = painted(container, '_fd-row');
    expect(card).toContain('_fd-row');
    expect(card).toContain('_ai-flex-start');
  });

  it('reads as pressable across the whole card', () => {
    const { container } = renderWithProviders(<CheckboxCardFrame />);
    expect(painted(container, '_fd-row')).toContain('_cur-pointer');
  });

  it('carries exactly one border at rest, on the $color6 seam', () => {
    const { container } = renderWithProviders(<CheckboxCardFrame />);
    const card = painted(container, '_fd-row');
    expect(card).toContain('_btw-1px');
    expect(card).toContain('_btc-color6');
  });

  it('moves the border one step up the ramp on hover, and only on hover', () => {
    const { container } = renderWithProviders(<CheckboxCardFrame />);
    const card = painted(container, '_fd-row');
    expect(card).toContain('_btc-0hover-color7');
    expect(card).toContain('_btc-color6');
  });

  it('active changes the FILL and leaves the border exactly where it was', () => {
    const rest = renderWithProviders(<CheckboxCardFrame />);
    const restCard = painted(rest.container, '_fd-row');
    expect(restCard).toContain('_bg-color2');
    cleanup();
    const active = renderWithProviders(<CheckboxCardFrame active />);
    const activeCard = painted(active.container, '_fd-row');
    expect(activeCard).toContain('_bg-color3');
    expect(activeCard).not.toContain('_bg-color2');
    // the border is untouched: same width, same colour, no second outline
    expect(activeCard).toContain('_btw-1px');
    expect(activeCard).toContain('_btc-color6');
  });

  it('renders the control and the text column it is given', () => {
    const { container } = renderWithProviders(
      <CheckboxCardFrame>
        <span data-control />
        <CheckboxCardContent>
          <CheckboxCardLabel>Ship it</CheckboxCardLabel>
          <CheckboxCardDescription>Sends the release out</CheckboxCardDescription>
        </CheckboxCardContent>
      </CheckboxCardFrame>,
    );
    expect(container.querySelector('[data-control]')).toBeTruthy();
    expect(container.textContent).toContain('Ship it');
    expect(container.textContent).toContain('Sends the release out');
  });
});

describe('CheckboxCardContent — the text column', () => {
  it('stacks the label over the description and can shrink under a long word', () => {
    const { container } = renderWithProviders(<CheckboxCardContent />);
    const column = painted(container, '_miw-0px');
    expect(column).toContain('_fd-column');
    expect(column).toContain('_miw-0px');
    expect(column).toContain('_fg-1');
  });
});

describe('CheckboxCardLabel and CheckboxCardDescription', () => {
  it('makes the label the bold, full-contrast first line', () => {
    const { container } = renderWithProviders(<CheckboxCardLabel>Label</CheckboxCardLabel>);
    const label = classesOf(container.querySelector('p'));
    expect(label).toContain('_fow-600');
    expect(label).toContain('_lh-20px');
    expect(label).toContain('_col-color12');
  });

  it('paints the description one ramp step down, in the muted tier', () => {
    const label = renderWithProviders(<CheckboxCardLabel>Label</CheckboxCardLabel>);
    expect(classesOf(label.container.querySelector('p'))).toContain('_col-color12');
    cleanup();
    const description = renderWithProviders(<CheckboxCardDescription>Helper</CheckboxCardDescription>);
    const muted = classesOf(description.container.querySelector('p'));
    expect(muted).toContain('_col-color11');
    expect(muted).not.toContain('_col-color12');
  });

  it('leaves the description at the normal weight, so only the label is bold', () => {
    const { container } = renderWithProviders(<CheckboxCardDescription>Helper</CheckboxCardDescription>);
    expect(classesOf(container.querySelector('p'))).not.toContain('_fow-600');
  });
});
