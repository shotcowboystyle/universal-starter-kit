import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const src = readFileSync(path.join(import.meta.dirname, 'index.tsx'), 'utf-8');

describe('PhoneInput T-VALUE source contract', () => {
  it('puts dial and Area on $color so textAccent cannot dim them', () => {
    expect(src).toContain('data-testid="phone-dial"');
    expect(src).toContain('data-testid="phone-input"');
    expect(src).toContain('data-text-class="T-VALUE"');
    expect((src.match(/color="\$color"/gu) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('formCommonColors.muted');
  });

  it('letters the closed trigger 23px paint and 0/9/9/0 segment without retuning knobs', () => {
    expect(src).toContain('23px');
    expect(src).toContain('0/9/9/0');
    expect(src).not.toMatch(/height=\{23\}/u);
    expect(src).not.toMatch(/borderTopRightRadius=\{9\}/u);
  });
});
