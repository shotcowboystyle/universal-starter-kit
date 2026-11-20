import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;

describe('ThemeProvider knob injectors', () => {
  it('mounts FontKnobStyles inside KnobBridge so shipped apps inherit heading/body fonts', () => {
    const src = readFileSync(path.join(here, 'theme.tsx'), 'utf-8');
    expect(src).toMatch(/import \{ FontKnobStyles \} from ['"]\.\/FontKnobStyles['"]/u);
    expect(src).toContain('<FontKnobStyles');
    expect(src).toContain('const KnobBridge =');
    const bridge = src.slice(src.indexOf('const KnobBridge ='));
    expect(bridge).toContain('<FontKnobStyles');
  });

  it('mounts CornerSmoothingStyles inside KnobBridge so the squircle sheet is not tree-shaken', () => {
    const src = readFileSync(path.join(here, 'theme.tsx'), 'utf-8');
    expect(src).toMatch(/import \{ CornerSmoothingStyles \} from ['"]\.\/corner-smoothing['"]/u);
    const bridge = src.slice(src.indexOf('const KnobBridge ='));
    expect(bridge).toContain('<CornerSmoothingStyles');
    const native = readFileSync(path.join(here, 'theme.native.tsx'), 'utf-8');
    expect(native).toContain('<CornerSmoothingStyles');
  });

  it('does not invent a second knob store — cookies still feed PresetContext', () => {
    const src = readFileSync(path.join(here, 'theme.tsx'), 'utf-8');
    expect(src).toContain('readPresetCookie');
    expect(src).toContain('readOverridesCookie');
    expect(src).toContain('PresetContext.Provider');
  });
});
