import type { IntentOverride } from './preset.types';

// One emphasis system (SB-E-01): every intent Button renders SOLID like
// accent — fillStyle "filled" so the solid _Button sub-theme surface applies
// even under outlined presets.
export const defaultIntents: Record<string, IntentOverride> = {
  accent: {
    fillStyle: 'outlined',
    textAccent: 'high',
    Button: { fillStyle: 'filled' },
  },
  error: {
    textAccent: 'high',
    Button: { fillStyle: 'filled', elevation: 'small' },
    Input: { borderWidth: 'medium' },
  },
  warning: {
    textAccent: 'high',
    Button: { fillStyle: 'filled' },
    Input: { borderWidth: 'small' },
  },
  success: {
    textAccent: 'high',
    Button: { fillStyle: 'filled', elevation: 'none' },
  },
};
