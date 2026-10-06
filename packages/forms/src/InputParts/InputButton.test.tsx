import { renderWithProviders } from '@repo/test-utils';
import { SIZE_RECIPE_TOKENS, sizeRecipeForToken } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { Input } from './index';

describe('Input.Button', () => {
  it('decorative end-cap does not take the chip-dismiss glyph ring', () => {
    const result = renderWithProviders(
      <Input size="$4">
        <Input.Box size="$4">
          <Input.Button
            size="$4"
            aria-label="Cap">
            x
          </Input.Button>
        </Input.Box>
      </Input>,
    );
    const btn = result.getByLabelText('Cap');
    expect(btn).not.toBeNull();
    expect(btn.className).not.toMatch(/mp-chip-dismiss/u);
    expect(btn.querySelector('.mp-chip-dismiss-ring')).toBeNull();
  });

  it('glyphRing is a real tab stop that rings the glyph, not the end-cap box', () => {
    const result = renderWithProviders(
      <Input size="$4">
        <Input.Box size="$4">
          <Input.Button
            glyphRing
            size="$4"
            aria-label="Show password">
            x
          </Input.Button>
        </Input.Box>
      </Input>,
    );
    const btn = result.getByLabelText('Show password');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('tabindex')).toBe('0');
    expect(btn.className).toMatch(/mp-chip-dismiss/u);
    expect(btn.className).not.toMatch(/mp-chip-dismiss-ring/u);
    const ring = btn.querySelector<HTMLElement>('.mp-chip-dismiss-ring');
    expect(ring).not.toBeNull();
    expect(btn.contains(ring)).toBe(true);
  });

  it('a bare string child is a LABEL, not an icon type to createElement', () => {
    const result = renderWithProviders(
      <Input size="$4">
        <Input.Box size="$4">
          <Input.Button
            size="$4"
            aria-label="Cap">
            Scan
          </Input.Button>
        </Input.Box>
      </Input>,
    );
    const btn = result.getByLabelText('Cap');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Scan');
    expect(result.container.querySelector('scan')).toBeNull();
  });

  it('end-cap square is generated from the size recipe at every token', () => {
    for (const token of SIZE_RECIPE_TOKENS) {
      if (token === '$true') {
        continue;
      }
      const { height } = sizeRecipeForToken(token);
      const result = renderWithProviders(
        <Input size={token}>
          <Input.Box size={token}>
            <Input.Button
              glyphRing
              size={token}
              aria-label={`reveal-${token}`}>
              x
            </Input.Button>
          </Input.Box>
        </Input>,
      );
      const btn = result.getByLabelText(`reveal-${token}`);
      expect(btn.dataset.endCap, token).toBe(String(height));
    }
  });
});
