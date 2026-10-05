import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('PhoneInput T-VALUE source contract', () => {
  it('puts dial and Area on $color so textAccent cannot dim them', () => {
    expect(src).toContain('data-testid="phone-dial"');
    expect(src).toContain('data-testid="phone-input"');
    expect(src).toContain('data-text-class="T-VALUE"');
    expect((src.match(/color="\$color"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('formCommonColors.muted');
  });

  it('letters the closed trigger 23px paint and 0/9/9/0 segment without retuning knobs', () => {
    expect(src).toContain('23px');
    expect(src).toContain('0/9/9/0');
    expect(src).not.toMatch(/height=\{23\}/);
    expect(src).not.toMatch(/borderTopRightRadius=\{9\}/);
  });
});
