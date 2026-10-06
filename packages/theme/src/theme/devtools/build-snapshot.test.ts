import { describe, expect, it } from 'vitest';

import { buildSnapshot } from './build-snapshot';
import type { SnapshotInput } from './build-snapshot';

const makeInput = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
  knobValues: {},
  lightColors: [],
  darkColors: [],
  ...overrides,
});

describe(buildSnapshot, () => {
  it.each([
    ['generates a markdown string with a title', '# Theme Snapshot'],
    ['includes the generated timestamp', 'Generated:'],
    ['shows (none / custom) when no preset', '(none / custom)'],
    ['shows placeholder when no colors available', '_(no theme colors available)_'],
  ])('%s', (_name, expected) => {
    expect(buildSnapshot(makeInput())).toContain(expected);
  });

  it('includes configuration section', () => {
    const result = buildSnapshot(
      makeInput({
        activePreset: 'dark-mode',
        schemeSetting: 'dark',
        schemeValue: 'dark',
        currentColor: 'blue',
      }),
    );
    expect(result).toContain('## Configuration');
    expect(result).toContain('dark-mode');
    expect(result).toContain('blue');
  });

  it('includes knobs table', () => {
    const result = buildSnapshot(
      makeInput({
        knobValues: { fillStyle: 'outlined', borderRadius: 'large' },
      }),
    );
    expect(result).toContain('## Knobs');
    expect(result).toContain('| fillStyle | outlined |');
    expect(result).toContain('| borderRadius | large |');
  });

  it('includes state knob overrides when present', () => {
    const result = buildSnapshot(
      makeInput({
        knobValues: { 'hover.elevation': 'medium' },
      }),
    );
    expect(result).toContain('| hover.elevation | medium |');
  });

  it('includes semantic groups table', () => {
    const result = buildSnapshot(makeInput());
    expect(result).toContain('## Semantic Groups');
    expect(result).toContain('Background');
    expect(result).toContain('Text');
  });

  it('includes light and dark color tables when provided', () => {
    const result = buildSnapshot(
      makeInput({
        lightColors: ['#fff', '#eee', '#ddd', '#ccc', '#bbb', '#aaa', '#999', '#888', '#777', '#666', '#555', '#444'],
        darkColors: ['#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888', '#999', '#aaa', '#bbb', '#ccc'],
      }),
    );
    expect(result).toContain('### light mode');
    expect(result).toContain('### dark mode');
    expect(result).toContain('$color1');
    expect(result).toContain('$color12');
  });
});
