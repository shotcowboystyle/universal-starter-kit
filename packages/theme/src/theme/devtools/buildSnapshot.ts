import { semanticGroups } from '../colorRules';

const knobKeys = [
  'fillStyle',
  'borderRadius',
  'cornerSmoothing',
  'borderWidth',
  'elevation',
  'space',
  'size',
  'density',
  'textAccent',
  'headingFont',
  'bodyFont',
  'fontWeight',
  'animation',
  'fieldLabelPlacement',
  'requiredMarking',
  'tableZebra',
  'bulkBarPlacement',
  'selectAllScope',
  'timestampStyle',
  'disabledStyle',
  'formAutofocus',
];

const stateKnobKeys = ['elevation', 'borderWidth', 'borderRadius'] as const;
const stateNames = ['hover', 'press', 'focus', 'focusVisible'] as const;

export interface SnapshotInput {
  knobValues: Record<string, string | undefined>;
  activePreset?: string;
  activeProfile?: string;
  schemeSetting?: string;
  schemeValue?: string;
  currentColor?: string;
  lightColors: string[];
  darkColors: string[];
}

export function buildSnapshot(input: SnapshotInput): string {
  const { knobValues, activePreset, activeProfile, schemeSetting, schemeValue, currentColor, lightColors, darkColors } =
    input;
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w('# Theme Snapshot');
  w(`Generated: ${new Date().toISOString()}`);
  w('');

  // ── Configuration ──────────────────────────────────────────
  w('## Configuration');
  w(`- **Preset**: ${activePreset || '(none / custom)'}`);
  if (activeProfile) {
    w(`- **Profile**: ${activeProfile}`);
  }
  if (schemeSetting) {
    w(`- **Scheme setting**: ${schemeSetting}`);
  }
  if (schemeValue) {
    w(`- **Resolved scheme**: ${schemeValue}`);
  }
  w(`- **Theme color**: ${currentColor || '(none)'}`);
  w('');

  // ── Knobs ──────────────────────────────────────────────────
  w('## Knobs');
  w('| Knob | Value |');
  w('|------|-------|');
  for (const key of knobKeys) {
    w(`| ${key} | ${knobValues[key] || '(default)'} |`);
  }
  for (const state of stateNames) {
    for (const key of stateKnobKeys) {
      const val = knobValues[`${state}.${key}`];
      if (val) {
        w(`| ${state}.${key} | ${val} |`);
      }
    }
  }
  w('');

  // ── Semantic Groups ──────────────────────────────────────────
  w('## Semantic Groups');
  w('');
  w('| Group | Steps |');
  w('|-------|-------|');
  for (const g of semanticGroups) {
    w(`| ${g.label} | ${g.from}–${g.to} |`);
  }
  w('');

  // ── Actual theme colors ($color1–$color12) ─────────────────
  w('## Theme Colors ($color1–$color12)');
  w('');
  for (const [label, colors] of [
    ['light', lightColors],
    ['dark', darkColors],
  ] as const) {
    w(`### ${label} mode`);
    if (colors.length > 0) {
      w('| Token | Hex |');
      w('|-------|-----|');
      for (let i = 0; i < Math.min(12, colors.length); i++) {
        w(`| $color${i + 1} | ${colors[i] || '(empty)'} |`);
      }
    } else {
      w('_(no theme colors available)_');
    }
    w('');
  }

  return lines.join('\n');
}
