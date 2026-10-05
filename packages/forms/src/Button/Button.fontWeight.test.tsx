/**
 * @vitest-environment jsdom
 *
 * The `fontWeight` knob must reach the Button LABEL. A literal
 * `fontWeight="400"` sat after the `knobProps.body` spread and pinned the
 * label at 400 in both schemes, while Input and Select moved to 700 off the
 * same knob. The knob family rules already say
 * `button | ... | fonts honour`, so the render was the thing that was wrong.
 *
 * The weight is read off the TEXT NODE, not the frame — the frame reported
 * 400 either way, which is how the defect survived. jsdom cannot cascade
 * Tamagui CSS, so the rendered value is the atomic class the text node emits
 * (`_fow-700`); it exists only when the prop survived the merge, which is the
 * thing under test. Same measurement Button.labelInk.test.tsx uses.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const SCHEMES = ['light', 'dark'] as const;

function inkWeight(el: HTMLElement): string {
  const inline = el.style.fontWeight;
  if (inline) {
    return String(inline);
  }
  for (const cls of String(el.className ?? '').split(/\s+/)) {
    const match = cls.match(/^_fow-(\d+)$/);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function labelNode(fontWeight: 'regular' | 'bold', scheme: (typeof SCHEMES)[number], label: string): HTMLElement {
  renderWithProviders(
    <Theme name={scheme}>
      <Preset overrides={{ fontWeight }}>
        <Button>{label}</Button>
      </Preset>
    </Theme>,
  );
  const node = screen.getByText(label) as HTMLElement;
  expect(node.tagName).not.toBe('BUTTON');
  return node;
}

describe('Button fontWeight knob', () => {
  it.each(SCHEMES)('%s: bold takes the label to 700', (scheme) => {
    const node = labelNode('bold', scheme, `bold-${scheme}`);
    expect(inkWeight(node)).toBe('700');
    expect(node.className).not.toMatch(/_fow-400\b/);
  });

  it.each(SCHEMES)('%s: regular keeps the label at 400', (scheme) => {
    const node = labelNode('regular', scheme, `regular-${scheme}`);
    expect(inkWeight(node)).toBe('400');
    expect(node.className).not.toMatch(/_fow-700\b/);
  });

  it.each(SCHEMES)('%s: the size variant never leaks 500/600 at either stop', (scheme) => {
    for (const stop of ['regular', 'bold'] as const) {
      const node = labelNode(stop, scheme, `leak-${stop}-${scheme}`);
      expect(node.className).not.toMatch(/_fow-500\b/);
      expect(node.className).not.toMatch(/_fow-600\b/);
    }
  });
});
