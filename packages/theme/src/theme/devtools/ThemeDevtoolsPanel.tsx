/**
 * TanStack Devtools plugin panel for controlling theme knobs at runtime.
 * TODO(native): This panel is web-only for now. TanStack Devtools does not yet
 * support React Native; when it does, revisit this panel for native compatibility.
 *
 * Controls:
 *  - Color scheme (system / light / dark) via @vxrn/color-scheme
 *  - Preset picker (using registered presets)
 *  - All knobs: fillStyle, borderRadius, cornerSmoothing, borderWidth,
 *    elevation, space, size, density, textAccent, headingFont, bodyFont,
 *    fontWeight, animation,
 *    plus house decisions (fieldLabelPlacement, requiredMarking, tableZebra,
 *    bulkBarPlacement, selectAllScope, timestampStyle, disabledStyle,
 *    formAutofocus)
 *
 * This panel is rendered *inside* the TanStack Devtools shell so it shares
 * the same React tree and can call hooks like `useTheme` / `useUserScheme`.
 *
 * ---------------------------------------------------------------------------
 * Theme sync (devtools panel ↔ website)
 * ---------------------------------------------------------------------------
 * The TanStack Devtools shell has its own "Choose theme" setting (light/dark)
 * stored in shared storage under `tanstack_devtools_settings`. This panel keeps
 * the devtools chrome theme and the website color scheme in sync:
 *
 *  - Devtools → Website: When the user changes the devtools panel theme, the
 *    `devtoolsTheme` prop (passed via the render function callback) updates.
 *    A `useEffect` detects the change and calls `scheme.set()`.
 *
 *  - Website → Devtools: When the user changes the color scheme via this
 *    panel's controls, a `useEffect` writes the resolved scheme value to the
 *    `tanstack_devtools_settings` storage entry. The devtools chrome
 *    picks this up on its next initialization (page reload).
 *
 * ---------------------------------------------------------------------------
 * Cookie / SSR verification
 * ---------------------------------------------------------------------------
 * 1. On every control change, the panel calls `setKnobs(...)` from `useTheme`.
 * 2. `setKnobs` in theme.tsx automatically writes the updated knobs to
 *    `mp.preset` + `mp.ov.*` cookies.
 * 3. On page refresh, SSR reads the cookie from request headers and renders
 *    with the persisted theme — no flash, no hydration mismatch.
 */

import { writeToClipboard } from '@repo/platform';
import { storage } from '@repo/store';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  type Knobs,
  type InteractionState,
  defaultKnobs,
  FillStyle,
  BorderRadius,
  CornerSmoothing,
  BorderWidth,
  Elevation,
  Space,
  Size,
  Density,
  TextAccent,
  HeadingFont,
  BodyFont,
  FontWeight,
  FieldLabelPlacement,
  RequiredMarking,
  TableZebra,
  BulkBarPlacement,
  SelectAllScope,
  TimestampStyle,
  DisabledStyle,
  FormAutofocus,
  interactionStates,
} from '../knobs';
import { getPresetNames, getPreset } from '../shared';
import { useTheme } from '../useTheme';

import { extractAnimationNames } from './animationOptions';
import { buildSnapshot } from './buildSnapshot';
import { ColorLineVisualizer } from './ColorLineVisualizer';
import {
  fillIcon as _fillIcon,
  spaceIcon as _spaceIcon,
  sizeIcon as _sizeIcon,
  densityIcon as _densityIcon,
  borderRadiusIcon as _borderRadiusIcon,
  cornerSmoothingIcon as _cornerSmoothingIcon,
  borderWidthIcon as _borderWidthIcon,
  elevationIcon as _elevationIcon,
  textAccentIcon as _textAccentIcon,
  headingFontIcon as _headingFontIcon,
  bodyFontIcon as _bodyFontIcon,
  fontWeightIcon as _fontWeightIcon,
  modeIcon as _modeIcon,
  fieldLabelPlacementIcon as _fieldLabelPlacementIcon,
  requiredMarkingIcon as _requiredMarkingIcon,
  tableZebraIcon as _tableZebraIcon,
  bulkBarPlacementIcon as _bulkBarPlacementIcon,
  selectAllScopeIcon as _selectAllScopeIcon,
  timestampStyleIcon as _timestampStyleIcon,
  disabledStyleIcon as _disabledStyleIcon,
  formAutofocusIcon as _formAutofocusIcon,
} from './knobIcons';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Storage key used by TanStack Devtools for its own settings. */
const tanstackDevtoolsSettings = 'tanstack_devtools_settings';

/** Storage key for persisted pinned knobs. */
const pinnedKnobsStorageKey = 'ts-theme-pinned';

/** Storage key for persisted expanded knob groups (those showing state sub-rows). */
const expandedKnobsStorageKey = 'ts-theme-expanded';

/** Human-readable labels for interaction states in the state sub-rows. */
const stateDisplayLabels: Record<InteractionState, string> = {
  hover: 'hover',
  press: 'press',
  focus: 'focus',
  focusVisible: 'focusV',
};

/** All knob property keys for override tracking. */
const knobKeys: (keyof Knobs)[] = [
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

/** Knob keys that support per-state overrides. */
const stateKnobKeys: (keyof Knobs)[] = [
  'fillStyle',
  'borderRadius',
  'borderWidth',
  'elevation',
  'space',
  'textAccent',
  'headingFont',
  'bodyFont',
  'fontWeight',
];

interface DesignProfile {
  [key: string]: string | undefined;
  color?: string;
}

const designProfiles: Record<string, DesignProfile> = {
  Bootstrap: {
    fillStyle: 'filled',
    borderRadius: 'small',
    borderWidth: 'medium',
    elevation: 'none',
    space: 'medium',
    size: 'medium',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'regular',
    animation: 'quick',
    color: 'blue',
  },
  'Material UI': {
    fillStyle: 'filled',
    borderRadius: 'large',
    borderWidth: 'none',
    elevation: 'small',
    space: 'medium',
    size: 'medium',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'bold',
    animation: 'medium',
    color: 'purple',
    'hover.elevation': 'medium',
  },
  'GTK4 / Adwaita': {
    fillStyle: 'filled',
    borderRadius: 'small',
    borderWidth: 'small',
    elevation: 'none',
    space: 'medium',
    size: 'medium',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'regular',
    animation: 'quick',
    color: 'gray',
  },
  'Fluent UI': {
    fillStyle: 'filled',
    borderRadius: 'small',
    borderWidth: 'small',
    elevation: 'small',
    space: 'medium',
    size: 'medium',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'regular',
    animation: 'quick',
    color: 'blue',
    'hover.elevation': 'small',
  },
};

const profileNames = ['', ...Object.keys(designProfiles)] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SchemeHook {
  setting: 'system' | 'light' | 'dark';
  value: 'light' | 'dark';
  set: (s: 'system' | 'light' | 'dark') => void;
}

/**
 * Inline styles that adapt to the devtools chrome theme (light/dark) so the
 * panel looks correct regardless of the devtools panel theme setting.
 */
function createStyles(isDark: boolean) {
  return {
    panel: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 13,
      color: isDark ? '#e8e8e8' : '#1a1a1a',
      padding: 12,
      display: 'flex' as const,
      flexDirection: 'column' as const,
      gap: 12,
      height: '100%',
      overflowY: 'auto' as const,
      background: 'transparent',
    },
    knobsRow: {
      display: 'flex' as const,
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      alignItems: 'flex-start' as const,
      alignContent: 'flex-start' as const,
      gap: 8,
    },
    card: {
      display: 'flex' as const,
      flexDirection: 'column' as const,
      gap: 4,
      padding: '6px 10px',
      borderRadius: 6,
      border: isDark ? '1px solid #333' : '1px solid #e0e0e0',
      background: isDark ? '#1e1e1e' : '#fafafa',
      minWidth: 140,
    },
    label: {
      fontSize: 11,
      fontWeight: 500,
      color: isDark ? '#888' : '#777',
      whiteSpace: 'nowrap' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
    },
    select: {
      padding: '3px 6px',
      borderRadius: 4,
      border: isDark ? '1px solid #444' : '1px solid #ccc',
      background: isDark ? '#2a2a2a' : '#fff',
      color: isDark ? '#e8e8e8' : '#1a1a1a',
      cursor: 'pointer',
      fontSize: 13,
      fontFamily: 'inherit',
      outline: 'none',
      width: '100%',
    },
    toggleRow: {
      display: 'flex' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    toggle: (active: boolean) =>
      ({
        width: 36,
        height: 20,
        borderRadius: 10,
        background: active ? '#7c6cff' : isDark ? '#444' : '#ccc',
        position: 'relative' as const,
        cursor: 'pointer',
        border: 'none',
        padding: 0,
        transition: 'background 0.2s',
      }) as const,
    toggleKnob: (active: boolean) =>
      ({
        width: 16,
        height: 16,
        borderRadius: 8,
        background: '#fff',
        position: 'absolute' as const,
        top: 2,
        left: active ? 18 : 2,
        transition: 'left 0.2s',
      }) as const,
    iconBtn: (active: boolean) =>
      ({
        width: 30,
        height: 30,
        borderRadius: 6,
        border: active
          ? `1.5px solid ${isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'}`
          : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        background: active ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)') : 'transparent',
        cursor: 'pointer',
        display: 'flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: 0,
        transition: 'all 0.15s ease',
        outline: 'none',
      }) as const,
    iconRow: {
      display: 'flex' as const,
      gap: 2,
      justifyContent: 'flex-end' as const,
    },
    resetBtn: {
      padding: '4px 10px',
      borderRadius: 4,
      border: isDark ? '1px solid #555' : '1px solid #ccc',
      background: isDark ? '#2a2a2a' : '#f5f5f5',
      color: isDark ? '#e8e8e8' : '#1a1a1a',
      cursor: 'pointer',
      fontSize: 11,
      fontFamily: 'inherit',
      fontWeight: 500,
      transition: 'all 0.15s',
      whiteSpace: 'nowrap' as const,
    },
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PinCheckbox({ pinned, onToggle, isDark }: { pinned: boolean; onToggle: () => void; isDark: boolean }) {
  return (
    <label
      title={pinned ? "Pinned — random won't change this" : 'Pin to protect from random'}
      style={{
        position: 'absolute' as const,
        top: 3,
        right: 3,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        zIndex: 1,
        opacity: pinned ? 1 : 0,
        transition: 'opacity 0.15s',
      }}
      className="pin-checkbox">
      <input
        type="checkbox"
        checked={pinned}
        onChange={onToggle}
        style={{
          width: 10,
          height: 10,
          margin: 0,
          cursor: 'pointer',
          accentColor: isDark ? '#e8e8e8' : '#1a1a1a',
        }}
      />
    </label>
  );
}

function Dropdown<V extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  format,
  styles,
  pinned,
  onTogglePin,
  onUnset,
  isDark,
  children,
}: {
  label: string;
  options: readonly V[];
  value: V;
  onChange: (v: V) => void;
  format?: (v: V) => string;
  styles: ReturnType<typeof createStyles>;
  pinned?: boolean;
  onTogglePin?: () => void;
  onUnset?: () => void;
  isDark?: boolean;
  children?: ReactNode;
}) {
  const optionStyle = isDark
    ? { backgroundColor: '#1f1f1f', color: '#e8e8e8' }
    : { backgroundColor: '#ffffff', color: '#1a1a1a' };
  return (
    <div
      style={{ ...styles.card, position: 'relative' as const }}
      onMouseEnter={(e) => {
        const element = (e.currentTarget as HTMLElement).querySelector('.pin-checkbox') as HTMLElement | null;
        if (element && !pinned) {
          element.style.opacity = '0.5';
        }
      }}
      onMouseLeave={(e) => {
        const element = (e.currentTarget as HTMLElement).querySelector('.pin-checkbox') as HTMLElement | null;
        if (element && !pinned) {
          element.style.opacity = '0';
        }
      }}>
      {onTogglePin && <PinCheckbox pinned={!!pinned} onToggle={onTogglePin} isDark={!!isDark} />}
      <span style={styles.label}>{label}</span>
      <select
        style={{
          ...styles.select,
          colorScheme: isDark ? 'dark' : 'light',
        }}
        value={value === undefined ? '__unset__' : String(value)}
        onChange={(e) => {
          const rawValue = e.target.value;
          if (rawValue === '__unset__') {
            onUnset?.();
            return;
          }
          const matchedOption = options.find((option) => String(option) === rawValue);
          if (matchedOption !== undefined) {
            onChange(matchedOption);
          }
        }}>
        {onUnset && (
          <option value="__unset__" style={optionStyle}>
            unset (inherit)
          </option>
        )}
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)} style={optionStyle}>
            {format ? format(opt) : String(opt)}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon-based toggle group
// ---------------------------------------------------------------------------

function CollapseButton({ expanded, onToggle, isDark }: { expanded: boolean; onToggle: () => void; isDark: boolean }) {
  return (
    <button
      type="button"
      title={expanded ? 'Collapse state overrides' : 'Expand state overrides'}
      onClick={onToggle}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        color: isDark ? '#666' : '#aaa',
        transition: 'transform 0.15s, color 0.15s',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" role="img" aria-label="Toggle">
        <title>Toggle state overrides</title>
        <path
          d="M3 1.5l4 3.5-4 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function IconGroup<V extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  icon,
  styles,
  isDark,
  pinned,
  onTogglePin,
  expanded,
  onToggleExpand,
  onUnset,
  children,
}: {
  label: string;
  options: readonly V[];
  /** Pass `undefined` to show nothing selected (no overrides). */
  value: V | undefined;
  onChange: (v: V) => void;
  icon: (v: V, active: boolean, dark: boolean) => ReactNode;
  styles: ReturnType<typeof createStyles>;
  isDark: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onUnset?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ ...styles.card, position: 'relative' as const }}
      onMouseEnter={(e) => {
        const element = (e.currentTarget as HTMLElement).querySelector('.pin-checkbox') as HTMLElement | null;
        if (element && !pinned) {
          element.style.opacity = '0.5';
        }
      }}
      onMouseLeave={(e) => {
        const element = (e.currentTarget as HTMLElement).querySelector('.pin-checkbox') as HTMLElement | null;
        if (element && !pinned) {
          element.style.opacity = '0';
        }
      }}>
      {onTogglePin && <PinCheckbox pinned={!!pinned} onToggle={onTogglePin} isDark={isDark} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {onToggleExpand && <CollapseButton expanded={!!expanded} onToggle={onToggleExpand} isDark={isDark} />}
        <span style={styles.label}>{label}</span>
      </div>
      <div style={styles.iconRow}>
        {onUnset && (
          <button
            type="button"
            style={{
              ...styles.iconBtn(value === undefined),
              padding: '1px 4px',
              fontSize: 10,
              minWidth: 0,
            }}
            onClick={onUnset}
            title="unset (inherit)"
            aria-pressed={value === undefined}>
            ↺
          </button>
        )}
        {options.map((opt) => {
          const active = value !== undefined && opt === value;
          return (
            <button
              key={String(opt)}
              type="button"
              style={styles.iconBtn(active)}
              onClick={() => {
                onChange(opt);
              }}
              title={String(opt)}
              aria-pressed={active}>
              {icon(opt, active, isDark)}
            </button>
          );
        })}
      </div>
      {expanded && children}
    </div>
  );
}

function StateSubRow({
  stateName,
  options,
  value,
  onChange,
  icon,
  styles,
  isDark,
}: {
  stateName: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  icon: (v: string, active: boolean, dark: boolean) => ReactNode;
  styles: ReturnType<typeof createStyles>;
  isDark: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: isDark ? '#666' : '#aaa',
          width: 46,
          textAlign: 'right',
          flexShrink: 0,
        }}>
        {stateName}
      </span>
      <div style={{ ...styles.iconRow, gap: 2 }}>
        <button
          type="button"
          style={{
            ...styles.iconBtn(value === ''),
            padding: '1px 4px',
            fontSize: 9,
            minWidth: 0,
          }}
          onClick={() => {
            onChange('');
          }}
          title="inherit (no override)">
          –
        </button>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              style={{ ...styles.iconBtn(active), transform: 'scale(0.85)' }}
              onClick={() => {
                onChange(opt);
              }}
              title={opt}>
              {icon(opt, active, isDark)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon renderers — wrappers around shared knobIcons with local color logic
// ---------------------------------------------------------------------------

/** Resolve foreground color for an icon based on active state and theme. */
function ic(active: boolean, dark: boolean): string {
  return active ? (dark ? '#e8e8e8' : '#1a1a1a') : dark ? '#555' : '#bbb';
}

function modeIcon(v: 'system' | 'light' | 'dark', active: boolean, dark: boolean): ReactNode {
  return _modeIcon(v, ic(active, dark));
}

function fillIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _fillIcon(v, ic(active, dark));
}

function spaceIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _spaceIcon(v, ic(active, dark));
}

function sizeIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _sizeIcon(v, ic(active, dark));
}

function densityIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _densityIcon(v, ic(active, dark));
}

function borderRadiusIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _borderRadiusIcon(v, ic(active, dark));
}

function cornerSmoothingIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _cornerSmoothingIcon(v, ic(active, dark));
}

function borderWidthIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _borderWidthIcon(v, ic(active, dark));
}

function elevationIconWrap(v: string, active: boolean, dark: boolean): ReactNode {
  return _elevationIcon(v, ic(active, dark), dark);
}

function textAccentIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _textAccentIcon(v, ic(active, dark));
}

function headingFontIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _headingFontIcon(v, ic(active, dark));
}

function bodyFontIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _bodyFontIcon(v, ic(active, dark));
}

function fontWeightIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _fontWeightIcon(v, ic(active, dark));
}

function fieldLabelPlacementIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _fieldLabelPlacementIcon(v, ic(active, dark));
}

function requiredMarkingIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _requiredMarkingIcon(v, ic(active, dark));
}

function tableZebraIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _tableZebraIcon(v, ic(active, dark));
}

function bulkBarPlacementIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _bulkBarPlacementIcon(v, ic(active, dark));
}

function selectAllScopeIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _selectAllScopeIcon(v, ic(active, dark));
}

function timestampStyleIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _timestampStyleIcon(v, ic(active, dark));
}

function disabledStyleIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _disabledStyleIcon(v, ic(active, dark));
}

function formAutofocusIcon(v: string, active: boolean, dark: boolean): ReactNode {
  return _formAutofocusIcon(v, ic(active, dark));
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface ThemeDevtoolsPanelProps {
  /**
   * Pass `useUserScheme` from `one` or `@vxrn/color-scheme` so the panel can
   * control light/dark/system without importing `one` directly in the theme package.
   */
  useUserScheme?: () => SchemeHook;

  /**
   * The current TanStack Devtools panel chrome theme (`"light"` or `"dark"`).
   * Passed automatically when the plugin `render` is a function callback.
   * Used for bidirectional theme syncing and adapting panel styles.
   */
  devtoolsTheme?: 'light' | 'dark';

  /**
   * Additional preset names beyond those registered via `registerPreset()`.
   * Merged with auto-discovered presets from the registry.
   */
  extraPresets?: string[];

  /**
   * Available theme color names (e.g. `["blue", "green", "purple", ...]`).
   * When provided, a "Theme" dropdown is shown and colors are included in
   * the randomize action.
   */
  themeColors?: string[];

  /** The currently active theme color name (e.g. `"blue"` or `""`). */
  currentThemeColor?: string;

  /** Callback invoked when the user picks a different theme color. */
  onThemeColorChange?: (color: string) => void;

  /**
   * The Tamagui config object (from `createTamagui()`). When provided, the
   * panel extracts live `$color1`–`$color12` values from the config's themes
   * and passes them to the ColorLineVisualizer. This avoids relying on DOM
   * CSS variable reading which doesn't work inside shadow DOM / isolated
   * rendering contexts like TanStack Devtools.
   */
  tamaguiConfig?: unknown;
}

/**
 * Extract 12 tokens from a Tamagui config for a given theme name.
 * @param prefix - Token prefix: `"color"` for `$color1`–`$color12`,
 *                 `"accent"` for `$accent1`–`$accent12`.
 * Tries the exact sub-theme name first, then falls back to the base scheme.
 */
function extractThemeTokenColors(
  tamaguiConfig: unknown,
  scheme: 'light' | 'dark',
  colorTheme?: string,
  prefix: 'color' | 'accent' = 'color',
): string[] | undefined {
  const config = tamaguiConfig as Record<string, unknown> | null;
  const themes = config?.themes as Record<string, Record<string, unknown>> | undefined;
  if (!themes) {
    return undefined;
  }

  const candidates: string[] = [];
  if (colorTheme) {
    candidates.push(`${scheme}_${colorTheme}`);
  }
  candidates.push(scheme);

  for (const name of candidates) {
    const theme = themes[name];
    if (!theme) {
      continue;
    }
    const colors: string[] = [];
    let found = false;
    for (let i = 1; i <= 12; i++) {
      const token = theme[`${prefix}${i}`];
      let val: string | undefined;
      if (typeof token === 'string') {
        val = token;
      } else if (token && typeof token === 'object' && 'val' in (token as Record<string, unknown>)) {
        val = String((token as { val: unknown }).val);
      }
      if (val) {
        colors.push(val);
        found = true;
      } else {
        colors.push('');
      }
    }
    if (found) {
      return colors;
    }
  }
  return undefined;
}

export function ThemeDevtoolsPanel({
  useUserScheme,
  extraPresets,
  devtoolsTheme,
  themeColors,
  currentThemeColor,
  onThemeColorChange,
  tamaguiConfig,
}: ThemeDevtoolsPanelProps) {
  const [knobs, setKnobs, , setPreset, activePresetName] = useTheme();
  const scheme = useUserScheme?.();
  const isDark = devtoolsTheme !== 'light';
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const animationOptions = useMemo(() => ['none', ...extractAnimationNames(tamaguiConfig)], [tamaguiConfig]);

  // Knobs the user has set. Seeded from the knobs that differ from what the
  // active preset supplies, which is what the mp.ov.* cookies hold: core's
  // TanstackDevtools keys the shell on the scheme, so a Scheme click remounts
  // this panel, and a reload does the same.
  const [overrides, setOverrides] = useState<Set<string>>(() => {
    const presetKnobs = activePresetName ? getPreset(activePresetName)?.knobs : undefined;
    return new Set(knobKeys.filter((key) => knobs[key] !== (presetKnobs?.[key] ?? defaultKnobs[key])));
  });
  const [pinnedKnobs, setPinnedKnobs] = useState<Set<string>>(() => {
    try {
      const raw = storage.getItem(pinnedKnobsStorageKey);
      const stored = typeof raw === 'string' || raw === null ? raw : null;
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch {}
    return new Set();
  });
  const [activeProfile, setActiveProfile] = useState('');

  const [expandedKnobs, setExpandedKnobs] = useState<Set<string>>(() => {
    try {
      const raw = storage.getItem(expandedKnobsStorageKey);
      const stored = typeof raw === 'string' || raw === null ? raw : null;
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed.filter((k) => stateKnobKeys.includes(k as keyof Knobs)));
      }
    } catch {}
    return new Set();
  });

  const knobsRef = useRef(knobs);
  knobsRef.current = knobs;

  useEffect(() => {
    void Promise.resolve(storage.setItem(pinnedKnobsStorageKey, JSON.stringify([...pinnedKnobs]))).catch(() => {});
  }, [pinnedKnobs]);

  useEffect(() => {
    void Promise.resolve(storage.setItem(expandedKnobsStorageKey, JSON.stringify([...expandedKnobs]))).catch(() => {});
  }, [expandedKnobs]);

  const clearStateOverridesForKeys = useCallback(
    (keys: string[]) => {
      const current = knobsRef.current;
      const partial: Partial<Knobs> = {};
      for (const state of interactionStates) {
        const stateKnobs = { ...current[state] } as Record<string, unknown>;
        let mutated = false;
        for (const key of keys) {
          if (stateKnobs[key] !== undefined) {
            stateKnobs[key] = undefined;
            mutated = true;
          }
        }
        if (mutated) {
          (partial as Record<string, unknown>)[state] = stateKnobs;
        }
      }
      if (Object.keys(partial).length > 0) {
        setKnobs(partial);
      }
    },
    [setKnobs],
  );

  const toggleExpand = useCallback(
    (key: string) => {
      let collapsing = false;
      setExpandedKnobs((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          collapsing = true;
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      if (collapsing) {
        clearStateOverridesForKeys([key]);
      }
    },
    [clearStateOverridesForKeys],
  );

  const togglePin = useCallback((key: string) => {
    setPinnedKnobs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        for (const state of interactionStates) {
          next.delete(`${state}.${key}`);
        }
      } else {
        next.add(key);
        for (const state of interactionStates) {
          next.add(`${state}.${key}`);
        }
      }
      return next;
    });
  }, []);

  const allStateKnobsExpanded = useMemo(() => stateKnobKeys.every((key) => expandedKnobs.has(key)), [expandedKnobs]);

  const handleToggleAllStates = useCallback(() => {
    let collapsingAll = false;
    setExpandedKnobs((prev) => {
      const allExpanded = stateKnobKeys.every((key) => prev.has(key));
      if (allExpanded) {
        collapsingAll = true;
        return new Set();
      }
      return new Set(stateKnobKeys as readonly string[]);
    });
    if (collapsingAll) {
      clearStateOverridesForKeys(stateKnobKeys as string[]);
    }
  }, [clearStateOverridesForKeys]);

  const set = useCallback(
    <K extends keyof Knobs>(key: K, value: Knobs[K]) => {
      setOverrides((prev) => new Set(prev).add(key));
      setKnobs({ [key]: value } as Partial<Knobs>);
      if (activeProfile) {
        setActiveProfile('');
      }
    },
    [setKnobs, activeProfile],
  );

  const handleProfileChange = useCallback(
    (profileName: string) => {
      if (!profileName) {
        setActiveProfile('');
        return;
      }
      const profile = designProfiles[profileName];
      if (!profile) {
        return;
      }
      const partial: Partial<Knobs> = {};
      for (const key of knobKeys) {
        if (profile[key]) {
          (partial as Record<string, string>)[key] = profile[key];
        }
      }
      const hover: Record<string, string> = {};
      const press: Record<string, string> = {};
      for (const [k, v] of Object.entries(profile)) {
        if (!v) {
          continue;
        }
        if (k.startsWith('hover.')) {
          hover[k.slice(6)] = v;
        } else if (k.startsWith('press.')) {
          press[k.slice(6)] = v;
        }
      }
      if (Object.keys(hover).length) {
        partial.hover = hover;
      }
      if (Object.keys(press).length) {
        partial.press = press;
      }
      setKnobs(partial);
      setOverrides(new Set(knobKeys as readonly string[]));
      setPinnedKnobs(new Set());
      setActiveProfile(profileName);
      if (profile.color && onThemeColorChange) {
        onThemeColorChange(profile.color);
      }
    },
    [setKnobs, onThemeColorChange],
  );

  const handleClearKnobs = useCallback(() => {
    if (activeProfile && designProfiles[activeProfile]) {
      handleProfileChange(activeProfile);
      setExpandedKnobs(new Set());
      return;
    }
    setOverrides(new Set());
    setPinnedKnobs(new Set());
    setExpandedKnobs(new Set());
    setActiveProfile('');
    if (activePresetName) {
      setPreset(activePresetName);
    } else {
      setKnobs({ ...defaultKnobs });
    }
  }, [activeProfile, handleProfileChange, activePresetName, setPreset, setKnobs]);

  const handleApplyDefaults = useCallback(() => {
    setOverrides(new Set(knobKeys as readonly string[]));
    setPinnedKnobs(new Set());
    setExpandedKnobs(new Set());
    setActiveProfile('');
    setPreset('');
    setKnobs({ ...defaultKnobs });
  }, [setPreset, setKnobs]);

  // ── Copy Snapshot ───────────────────────────────────────────
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopySnapshot = useCallback(async () => {
    const knobValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(knobs)) {
      if (value && typeof value === 'object') {
        for (const [sk, sv] of Object.entries(value as Record<string, string>)) {
          if (sv) {
            knobValues[`${key}.${sk}`] = sv;
          }
        }
      } else {
        knobValues[key] = String(value);
      }
    }
    const lightColors = extractThemeTokenColors(tamaguiConfig, 'light', currentThemeColor) ?? [];
    const darkColors = extractThemeTokenColors(tamaguiConfig, 'dark', currentThemeColor) ?? [];

    const snapshot = buildSnapshot({
      knobValues,
      activePreset: activePresetName ?? undefined,
      schemeSetting: scheme?.setting,
      schemeValue: scheme?.value,
      currentColor: currentThemeColor,
      lightColors,
      darkColors,
    });
    const success = await writeToClipboard(snapshot);
    if (success) {
      setCopyStatus('copied');
      setTimeout(() => {
        setCopyStatus('idle');
      }, 2000);
    } else {
      setCopyStatus('error');
      setTimeout(() => {
        setCopyStatus('idle');
      }, 2000);
    }
  }, [knobs, activePresetName, scheme, currentThemeColor, tamaguiConfig]);

  const handleRandomize = useCallback(() => {
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const knobEnums: Record<string, readonly string[]> = {
      fillStyle: Object.values(FillStyle),
      borderRadius: Object.values(BorderRadius),
      borderWidth: Object.values(BorderWidth),
      elevation: Object.values(Elevation),
      space: Object.values(Space),
      size: Object.values(Size),
      textAccent: Object.values(TextAccent),
      headingFont: Object.values(HeadingFont),
      bodyFont: Object.values(BodyFont),
      fontWeight: Object.values(FontWeight),
      animation: animationOptions,
    };
    const partial: Partial<Knobs> = {};
    const newOverrides = new Set(knobKeys as readonly string[]);
    for (const key of knobKeys) {
      if (pinnedKnobs.has(key)) {
        continue;
      }
      const values = knobEnums[key];
      if (values) {
        (partial as Record<string, string>)[key] = pick(values);
      }
    }
    if (expandedKnobs.size > 0) {
      const knobEnumsForState: Record<string, readonly string[]> = {
        fillStyle: Object.values(FillStyle),
        borderRadius: Object.values(BorderRadius),
        borderWidth: Object.values(BorderWidth),
        elevation: Object.values(Elevation),
        space: Object.values(Space),
        textAccent: Object.values(TextAccent),
        headingFont: Object.values(HeadingFont),
        bodyFont: Object.values(BodyFont),
        fontWeight: Object.values(FontWeight),
      };
      for (const state of interactionStates) {
        const statePartial: Record<string, string> = {};
        for (const key of expandedKnobs) {
          const values = knobEnumsForState[key];
          if (values) {
            statePartial[key] = pick(values);
          }
        }
        if (Object.keys(statePartial).length > 0) {
          (partial as Record<string, unknown>)[state] = statePartial;
        }
      }
    }
    setOverrides(newOverrides);
    setKnobs(partial);
    if (!pinnedKnobs.has('color') && themeColors && onThemeColorChange) {
      const nonEmpty = themeColors.filter((c) => c !== '');
      if (nonEmpty.length > 0) {
        onThemeColorChange(pick(nonEmpty));
      }
    }
    if (!pinnedKnobs.has('scheme') && scheme) {
      scheme.set(pick(['light', 'dark'] as const));
    }
    if (activeProfile) {
      setActiveProfile('');
    }
  }, [setKnobs, themeColors, onThemeColorChange, scheme, pinnedKnobs, expandedKnobs, activeProfile, animationOptions]);

  // -------------------------------------------------------------------------
  // Preset picker
  // -------------------------------------------------------------------------
  const presetOptions = useMemo(() => {
    const registered = getPresetNames();
    const names = new Set<string>(registered);
    if (extraPresets) {
      for (const name of extraPresets) {
        names.add(name);
      }
    }
    return ['', ...Array.from(names).filter(Boolean).sort()];
  }, [extraPresets]);

  const handlePresetChange = useCallback(
    (presetName: string) => {
      if (!presetName) {
        return;
      }
      setPreset(presetName);
      setOverrides(new Set());
    },
    [setPreset],
  );

  const handleResetToPreset = useCallback(() => {
    if (activePresetName) {
      setPreset(activePresetName);
    } else {
      // Anonymous default preset (no `mp.preset` cookie): resetting must
      // still clear the persisted overrides instead of silently no-opping.
      setKnobs({ ...defaultKnobs });
    }
    setOverrides(new Set());
  }, [activePresetName, setPreset, setKnobs]);

  // -------------------------------------------------------------------------
  // Bidirectional theme sync: devtools panel ↔ website color scheme
  // -------------------------------------------------------------------------
  //
  // The scheme (light/dark/system) is orthogonal to knobs and managed entirely
  // by `useUserScheme` (SchemeProvider / @vxrn/color-scheme). The devtools
  // chrome theme and the website color scheme are kept in sync here.

  const prevDevtoolsTheme = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!devtoolsTheme || !scheme) {
      prevDevtoolsTheme.current = devtoolsTheme;
      return;
    }
    if (prevDevtoolsTheme.current === undefined) {
      prevDevtoolsTheme.current = devtoolsTheme;
      return;
    }
    if (prevDevtoolsTheme.current !== devtoolsTheme) {
      prevDevtoolsTheme.current = devtoolsTheme;
      if (scheme.value !== devtoolsTheme) {
        scheme.set(devtoolsTheme);
      }
    }
  }, [devtoolsTheme, scheme]);

  const schemeValue = scheme?.value;
  useEffect(() => {
    if (!schemeValue) {
      return;
    }
    void Promise.resolve(storage.getItem(tanstackDevtoolsSettings))
      .then((raw) => {
        const settings = raw ? JSON.parse(raw) : {};
        if (settings.theme !== schemeValue) {
          settings.theme = schemeValue;
          return Promise.resolve(storage.setItem(tanstackDevtoolsSettings, JSON.stringify(settings)));
        }
      })
      .catch(() => {
        // storage may be unavailable (e.g. SSR, iframe sandbox)
      });
  }, [schemeValue]);

  /** Return the value only if the user has explicitly overridden it, else undefined. */
  const getOverride = <K extends keyof Knobs>(key: K): Knobs[K] | undefined =>
    overrides.has(key) ? knobs[key] : undefined;

  const inheritedKnob = useCallback(
    <K extends keyof Knobs>(key: K): Knobs[K] => {
      const activeProfileConfig = activeProfile ? designProfiles[activeProfile] : undefined;
      if (activeProfileConfig?.[key]) {
        return activeProfileConfig[key] as Knobs[K];
      }
      if (activePresetName) {
        const presetKnobs = getPreset(activePresetName)?.knobs;
        if (presetKnobs?.[key] !== undefined) {
          return presetKnobs[key];
        }
      }
      return defaultKnobs[key];
    },
    [activeProfile, activePresetName],
  );

  const unset = useCallback(
    <K extends keyof Knobs>(key: K) => {
      setOverrides((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setKnobs({ [key]: inheritedKnob(key) } as Partial<Knobs>);
    },
    [setKnobs, inheritedKnob],
  );

  const setStateKnob = useCallback(
    (state: 'hover' | 'press' | 'focus' | 'focusVisible', key: string, value: string) => {
      const current = knobsRef.current;
      setKnobs({
        [state]: { ...current[state], [key]: value === '' ? undefined : value },
      } as Partial<Knobs>);
      setOverrides((prev) => new Set(prev).add(state));
      if (activeProfile) {
        setActiveProfile('');
      }
    },
    [setKnobs, activeProfile],
  );

  const getStateKnob = (state: 'hover' | 'press' | 'focus' | 'focusVisible', key: string): string => {
    const stateKnobs = knobs[state];
    return (stateKnobs as Record<string, string | undefined>)[key] ?? '';
  };

  const stateRows = (
    knobKey: string,
    options: readonly string[],
    icon: (v: string, active: boolean, dark: boolean) => ReactNode,
  ) =>
    interactionStates.map((state) => (
      <StateSubRow
        key={state}
        stateName={stateDisplayLabels[state]}
        options={options}
        value={getStateKnob(state, knobKey)}
        onChange={(v) => {
          setStateKnob(state, knobKey, v);
        }}
        icon={icon}
        styles={styles}
        isDark={isDark}
      />
    ));

  return (
    <div style={styles.panel}>
      {/* ── Knobs ── */}
      <div style={styles.knobsRow}>
        {presetOptions.length > 1 && (
          <Dropdown
            label="Preset"
            options={presetOptions}
            value={activePresetName ?? ''}
            onChange={(v) => {
              handlePresetChange(v);
            }}
            format={(v) => (v === '' ? 'custom' : String(v))}
            styles={styles}
          />
        )}
        {presetOptions.length > 1 && (
          <div style={styles.card}>
            <button type="button" style={styles.resetBtn} onClick={handleResetToPreset}>
              Reset to Preset
            </button>
          </div>
        )}
        {themeColors && themeColors.length > 1 && onThemeColorChange && (
          <Dropdown
            label="Theme"
            options={themeColors}
            value={currentThemeColor ?? ''}
            onChange={(v) => {
              onThemeColorChange(v);
            }}
            format={(v) => (v === '' ? 'none' : String(v))}
            styles={styles}
            pinned={pinnedKnobs.has('color')}
            onTogglePin={() => {
              togglePin('color');
            }}
            isDark={isDark}
          />
        )}
        {scheme && (
          <IconGroup
            label="Scheme"
            options={['system', 'light', 'dark'] as const}
            value={scheme.setting}
            onChange={(v) => {
              scheme.set(v);
            }}
            icon={modeIcon}
            styles={styles}
            isDark={isDark}
            pinned={pinnedKnobs.has('scheme')}
            onTogglePin={() => {
              togglePin('scheme');
            }}
          />
        )}
        <IconGroup
          label="Fill"
          options={Object.values(FillStyle)}
          value={getOverride('fillStyle')}
          onChange={(v) => {
            set('fillStyle', v);
          }}
          icon={fillIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('fillStyle')}
          onTogglePin={() => {
            togglePin('fillStyle');
          }}
          expanded={expandedKnobs.has('fillStyle')}
          onToggleExpand={() => {
            toggleExpand('fillStyle');
          }}
          onUnset={() => {
            unset('fillStyle');
          }}>
          {stateRows('fillStyle', Object.values(FillStyle), fillIcon)}
        </IconGroup>
        <IconGroup
          label="Size"
          options={Object.values(Size)}
          value={getOverride('size')}
          onChange={(v) => {
            set('size', v);
          }}
          icon={sizeIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('size')}
          onTogglePin={() => {
            togglePin('size');
          }}
          onUnset={() => {
            unset('size');
          }}
        />
        <IconGroup
          label="Space"
          options={Object.values(Space)}
          value={getOverride('space')}
          onChange={(v) => {
            set('space', v);
          }}
          icon={spaceIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('space')}
          onTogglePin={() => {
            togglePin('space');
          }}
          expanded={expandedKnobs.has('space')}
          onToggleExpand={() => {
            toggleExpand('space');
          }}
          onUnset={() => {
            unset('space');
          }}>
          {stateRows('space', Object.values(Space), spaceIcon)}
        </IconGroup>
        <IconGroup
          label="Density"
          options={Object.values(Density)}
          value={getOverride('density')}
          onChange={(v) => {
            set('density', v);
          }}
          icon={densityIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('density')}
          onTogglePin={() => {
            togglePin('density');
          }}
          onUnset={() => {
            unset('density');
          }}
        />
        <IconGroup
          label="Radius"
          options={Object.values(BorderRadius)}
          value={getOverride('borderRadius')}
          onChange={(v) => {
            set('borderRadius', v);
          }}
          icon={borderRadiusIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('borderRadius')}
          onTogglePin={() => {
            togglePin('borderRadius');
          }}
          expanded={expandedKnobs.has('borderRadius')}
          onToggleExpand={() => {
            toggleExpand('borderRadius');
          }}
          onUnset={() => {
            unset('borderRadius');
          }}>
          {stateRows('borderRadius', Object.values(BorderRadius), borderRadiusIcon)}
        </IconGroup>
        <IconGroup
          label="Smoothing"
          options={Object.values(CornerSmoothing)}
          value={getOverride('cornerSmoothing')}
          onChange={(v) => {
            set('cornerSmoothing', v);
          }}
          icon={cornerSmoothingIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('cornerSmoothing')}
          onTogglePin={() => {
            togglePin('cornerSmoothing');
          }}
          onUnset={() => {
            unset('cornerSmoothing');
          }}
        />
        <IconGroup
          label="Border"
          options={Object.values(BorderWidth)}
          value={getOverride('borderWidth')}
          onChange={(v) => {
            set('borderWidth', v);
          }}
          icon={borderWidthIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('borderWidth')}
          onTogglePin={() => {
            togglePin('borderWidth');
          }}
          expanded={expandedKnobs.has('borderWidth')}
          onToggleExpand={() => {
            toggleExpand('borderWidth');
          }}
          onUnset={() => {
            unset('borderWidth');
          }}>
          {stateRows('borderWidth', Object.values(BorderWidth), borderWidthIcon)}
        </IconGroup>
        <IconGroup
          label="Elevation"
          options={Object.values(Elevation)}
          value={getOverride('elevation')}
          onChange={(v) => {
            set('elevation', v);
          }}
          icon={elevationIconWrap}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('elevation')}
          onTogglePin={() => {
            togglePin('elevation');
          }}
          expanded={expandedKnobs.has('elevation')}
          onToggleExpand={() => {
            toggleExpand('elevation');
          }}
          onUnset={() => {
            unset('elevation');
          }}>
          {stateRows('elevation', Object.values(Elevation), elevationIconWrap)}
        </IconGroup>
        <IconGroup
          label="Text Accent"
          options={Object.values(TextAccent)}
          value={getOverride('textAccent')}
          onChange={(v) => {
            set('textAccent', v);
          }}
          icon={textAccentIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('textAccent')}
          onTogglePin={() => {
            togglePin('textAccent');
          }}
          expanded={expandedKnobs.has('textAccent')}
          onToggleExpand={() => {
            toggleExpand('textAccent');
          }}
          onUnset={() => {
            unset('textAccent');
          }}>
          {stateRows('textAccent', Object.values(TextAccent), textAccentIcon)}
        </IconGroup>
        <IconGroup
          label="Heading"
          options={Object.values(HeadingFont)}
          value={getOverride('headingFont')}
          onChange={(v) => {
            set('headingFont', v);
          }}
          icon={headingFontIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('headingFont')}
          onTogglePin={() => {
            togglePin('headingFont');
          }}
          expanded={expandedKnobs.has('headingFont')}
          onToggleExpand={() => {
            toggleExpand('headingFont');
          }}
          onUnset={() => {
            unset('headingFont');
          }}>
          {stateRows('headingFont', Object.values(HeadingFont), headingFontIcon)}
        </IconGroup>
        <IconGroup
          label="Body"
          options={Object.values(BodyFont)}
          value={getOverride('bodyFont')}
          onChange={(v) => {
            set('bodyFont', v);
          }}
          icon={bodyFontIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('bodyFont')}
          onTogglePin={() => {
            togglePin('bodyFont');
          }}
          expanded={expandedKnobs.has('bodyFont')}
          onToggleExpand={() => {
            toggleExpand('bodyFont');
          }}
          onUnset={() => {
            unset('bodyFont');
          }}>
          {stateRows('bodyFont', Object.values(BodyFont), bodyFontIcon)}
        </IconGroup>
        <IconGroup
          label="Weight"
          options={Object.values(FontWeight)}
          value={getOverride('fontWeight')}
          onChange={(v) => {
            set('fontWeight', v);
          }}
          icon={fontWeightIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('fontWeight')}
          onTogglePin={() => {
            togglePin('fontWeight');
          }}
          expanded={expandedKnobs.has('fontWeight')}
          onToggleExpand={() => {
            toggleExpand('fontWeight');
          }}
          onUnset={() => {
            unset('fontWeight');
          }}>
          {stateRows('fontWeight', Object.values(FontWeight), fontWeightIcon)}
        </IconGroup>
        <Dropdown
          label="Animation"
          options={animationOptions}
          value={getOverride('animation') ?? ''}
          onChange={(v) => {
            set('animation', v as Knobs['animation']);
          }}
          onUnset={() => {
            unset('animation');
          }}
          styles={styles}
          pinned={pinnedKnobs.has('animation')}
          onTogglePin={() => {
            togglePin('animation');
          }}
          isDark={isDark}
        />
        <IconGroup
          label="Label place"
          options={Object.values(FieldLabelPlacement)}
          value={getOverride('fieldLabelPlacement')}
          onChange={(v) => {
            set('fieldLabelPlacement', v);
          }}
          icon={fieldLabelPlacementIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('fieldLabelPlacement')}
          onTogglePin={() => {
            togglePin('fieldLabelPlacement');
          }}
          onUnset={() => {
            unset('fieldLabelPlacement');
          }}
        />
        <IconGroup
          label="Required mark"
          options={Object.values(RequiredMarking)}
          value={getOverride('requiredMarking')}
          onChange={(v) => {
            set('requiredMarking', v);
          }}
          icon={requiredMarkingIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('requiredMarking')}
          onTogglePin={() => {
            togglePin('requiredMarking');
          }}
          onUnset={() => {
            unset('requiredMarking');
          }}
        />
        <IconGroup
          label="Zebra"
          options={Object.values(TableZebra)}
          value={getOverride('tableZebra')}
          onChange={(v) => {
            set('tableZebra', v);
          }}
          icon={tableZebraIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('tableZebra')}
          onTogglePin={() => {
            togglePin('tableZebra');
          }}
          onUnset={() => {
            unset('tableZebra');
          }}
        />
        <IconGroup
          label="Bulk bar"
          options={Object.values(BulkBarPlacement)}
          value={getOverride('bulkBarPlacement')}
          onChange={(v) => {
            set('bulkBarPlacement', v);
          }}
          icon={bulkBarPlacementIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('bulkBarPlacement')}
          onTogglePin={() => {
            togglePin('bulkBarPlacement');
          }}
          onUnset={() => {
            unset('bulkBarPlacement');
          }}
        />
        <IconGroup
          label="Select all"
          options={Object.values(SelectAllScope)}
          value={getOverride('selectAllScope')}
          onChange={(v) => {
            set('selectAllScope', v);
          }}
          icon={selectAllScopeIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('selectAllScope')}
          onTogglePin={() => {
            togglePin('selectAllScope');
          }}
          onUnset={() => {
            unset('selectAllScope');
          }}
        />
        <IconGroup
          label="Timestamp"
          options={Object.values(TimestampStyle)}
          value={getOverride('timestampStyle')}
          onChange={(v) => {
            set('timestampStyle', v);
          }}
          icon={timestampStyleIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('timestampStyle')}
          onTogglePin={() => {
            togglePin('timestampStyle');
          }}
          onUnset={() => {
            unset('timestampStyle');
          }}
        />
        <IconGroup
          label="Disabled"
          options={Object.values(DisabledStyle)}
          value={getOverride('disabledStyle')}
          onChange={(v) => {
            set('disabledStyle', v);
          }}
          icon={disabledStyleIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('disabledStyle')}
          onTogglePin={() => {
            togglePin('disabledStyle');
          }}
          onUnset={() => {
            unset('disabledStyle');
          }}
        />
        <IconGroup
          label="Autofocus"
          options={Object.values(FormAutofocus)}
          value={getOverride('formAutofocus')}
          onChange={(v) => {
            set('formAutofocus', v);
          }}
          icon={formAutofocusIcon}
          styles={styles}
          isDark={isDark}
          pinned={pinnedKnobs.has('formAutofocus')}
          onTogglePin={() => {
            togglePin('formAutofocus');
          }}
          onUnset={() => {
            unset('formAutofocus');
          }}
        />
        <div
          style={{
            ...styles.card,
            flexDirection: 'row' as const,
            gap: 6,
            flexWrap: 'wrap' as const,
          }}>
          <select
            title="Design system profile"
            value={activeProfile}
            onChange={(e) => {
              handleProfileChange(e.target.value);
            }}
            style={{
              ...styles.select,
              width: 'auto',
              fontSize: 11,
              opacity: activeProfile ? 1 : 0.6,
            }}>
            {profileNames.map((name) => (
              <option key={name} value={name}>
                {name || 'profile'}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={{
              ...styles.resetBtn,
              ...(copyStatus === 'copied'
                ? {
                    background: isDark ? '#1a3a1a' : '#d4edda',
                    borderColor: isDark ? '#2d5a2d' : '#a3d9a5',
                  }
                : copyStatus === 'error'
                  ? {
                      background: isDark ? '#3a1a1a' : '#f8d7da',
                      borderColor: isDark ? '#5a2d2d' : '#f5c6cb',
                    }
                  : {}),
            }}
            onClick={handleCopySnapshot}>
            {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy Snapshot'}
          </button>
          <button type="button" style={styles.resetBtn} onClick={handleRandomize}>
            Random
          </button>
          <button
            type="button"
            style={styles.iconBtn(false)}
            onClick={handleToggleAllStates}
            title={allStateKnobsExpanded ? 'Collapse States' : 'Expand States'}
            aria-label={allStateKnobsExpanded ? 'Collapse States' : 'Expand States'}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" role="img" aria-label="States">
              <title>{allStateKnobsExpanded ? 'Collapse States' : 'Expand States'}</title>
              <path d="M2.5 4.5h7M2.5 8h7M2.5 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path
                d={allStateKnobsExpanded ? 'M12 10.5l-2-2 2-2' : 'M10 6.5l2 2-2 2'}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            style={styles.iconBtn(false)}
            onClick={handleApplyDefaults}
            title="Apply Defaults"
            aria-label="Apply Defaults">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" role="img" aria-label="Defaults">
              <title>Apply Defaults</title>
              <path
                d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx="5" cy="4.5" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="11" cy="11.5" r="1.2" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            style={styles.iconBtn(false)}
            onClick={handleClearKnobs}
            title="Clear"
            aria-label="Clear">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" role="img" aria-label="Clear">
              <title>Clear</title>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Color palette ── */}
      <ColorLineVisualizer
        knobs={knobs}
        isDark={isDark}
        themeColors={extractThemeTokenColors(tamaguiConfig, isDark ? 'dark' : 'light', currentThemeColor || undefined)}
        oppositeThemeColors={extractThemeTokenColors(
          tamaguiConfig,
          isDark ? 'light' : 'dark',
          currentThemeColor || undefined,
        )}
        accentColors={extractThemeTokenColors(
          tamaguiConfig,
          isDark ? 'dark' : 'light',
          currentThemeColor || undefined,
          'accent',
        )}
        oppositeAccentColors={extractThemeTokenColors(
          tamaguiConfig,
          isDark ? 'light' : 'dark',
          currentThemeColor || undefined,
          'accent',
        )}
      />
    </div>
  );
}
