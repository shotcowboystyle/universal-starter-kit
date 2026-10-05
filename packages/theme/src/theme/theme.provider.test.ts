import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('ThemeProvider knob injectors', () => {
  it('mounts FontKnobStyles inside KnobBridge so shipped apps inherit heading/body fonts', () => {
    const src = readFileSync(join(here, 'theme.tsx'), 'utf8');
    expect(src).toMatch(/import \{ FontKnobStyles \} from ['"]\.\/FontKnobStyles['"]/);
    expect(src).toContain('<FontKnobStyles');
    expect(src).toContain('function KnobBridge');
    const bridge = src.slice(src.indexOf('function KnobBridge'));
    expect(bridge).toContain('<FontKnobStyles');
  });

  it('mounts CornerSmoothingStyles inside KnobBridge so the squircle sheet is not tree-shaken', () => {
    const src = readFileSync(join(here, 'theme.tsx'), 'utf8');
    expect(src).toMatch(/import \{ CornerSmoothingStyles \} from ['"]\.\/cornerSmoothing['"]/);
    const bridge = src.slice(src.indexOf('function KnobBridge'));
    expect(bridge).toContain('<CornerSmoothingStyles');
    const native = readFileSync(join(here, 'theme.native.tsx'), 'utf8');
    expect(native).toContain('<CornerSmoothingStyles');
  });

  it('does not invent a second knob store — cookies still feed PresetContext', () => {
    const src = readFileSync(join(here, 'theme.tsx'), 'utf8');
    expect(src).toContain('readPresetCookie');
    expect(src).toContain('readOverridesCookie');
    expect(src).toContain('PresetContext.Provider');
  });
});
