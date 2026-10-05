import React, { type ReactNode } from 'react';

/**
 * Shared icon renderers for theme knob controls.
 *
 * Each icon function accepts a pre-resolved foreground `color` string so
 * that both the TanStack Devtools panel and the Storybook addon can use
 * the same rendering logic with their own color schemes.
 *
 * TanStack:  `ic(active, isDark)` → theme-adaptive foreground
 * Storybook: `ic(active)` → purple accent for active, gray for inactive
 */

export function fillIcon(value: string, color: string): ReactNode {
  if (value === 'filled') {
    return <div style={{ width: 14, height: 14, background: color, borderRadius: 2 }} />;
  }
  return <div style={{ width: 14, height: 14, border: `1.5px solid ${color}`, borderRadius: 2 }} />;
}

export function spaceIcon(value: string, color: string): ReactNode {
  const size = ({ small: 8, medium: 12, large: 16 } as Record<string, number>)[value] ?? 12;
  return <div style={{ width: size, height: size, background: color, borderRadius: 2 }} />;
}

export function sizeIcon(value: string, color: string): ReactNode {
  const height = ({ small: 8, medium: 11, large: 14 } as Record<string, number>)[value] ?? 11;
  return <div style={{ width: 4, height: height, background: color, borderRadius: 1 }} />;
}

export function densityIcon(value: string, color: string): ReactNode {
  // Comfortable = taller stack; compact = compressed stack.
  const gap = value === 'compact' ? 1 : 2;
  const barH = value === 'compact' ? 3 : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, width: 14 }}>
      <div style={{ height: barH, background: color, borderRadius: 1 }} />
      <div style={{ height: barH, background: color, borderRadius: 1 }} />
      <div style={{ height: barH, background: color, borderRadius: 1 }} />
    </div>
  );
}

export function borderRadiusIcon(value: string, color: string): ReactNode {
  const radius = ({ none: 0, small: 2, medium: 4, large: 7, full: 10 } as Record<string, number>)[value] ?? 0;
  return <div style={{ width: 14, height: 14, border: `1.5px solid ${color}`, borderRadius: radius }} />;
}

export function cornerSmoothingIcon(value: string, color: string): ReactNode {
  // Same nominal corner size, different curvature: circular-arc rounded
  // rect for `round`, continuous-curvature superellipse for `smooth`.
  const smooth = value === 'smooth';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" role="img" aria-label={value}>
      <title>{value}</title>
      {smooth ? (
        <path
          d="M7 1 C2.8 1 1 2.8 1 7 C1 11.2 2.8 13 7 13 C11.2 13 13 11.2 13 7 C13 2.8 11.2 1 7 1 Z"
          stroke={color}
          strokeWidth="1.5"
        />
      ) : (
        <rect x="1" y="1" width="12" height="12" rx="4" stroke={color} strokeWidth="1.5" />
      )}
    </svg>
  );
}

export function borderWidthIcon(value: string, color: string): ReactNode {
  if (value === 'none') {
    return <div style={{ width: 14, height: 14, background: color, borderRadius: 2, opacity: 0.35 }} />;
  }
  const width = ({ small: 1, medium: 1.5, large: 2 } as Record<string, number>)[value] ?? 1;
  return <div style={{ width: 14, height: 14, border: `${width}px solid ${color}`, borderRadius: 2 }} />;
}

export function elevationIcon(value: string, color: string, _isDark: boolean): ReactNode {
  const shadowColor = 'rgba(128,128,128,0.55)';
  const offset = ({ none: 0, small: 1, medium: 2, large: 3 } as Record<string, number>)[value] ?? 0;
  const shadowSize = ({ none: 0, small: 10, medium: 11, large: 12 } as Record<string, number>)[value] ?? 0;
  const squareSize = 10;
  const total = squareSize + offset * 2 + 1;

  if (offset === 0) {
    return (
      <div
        style={{
          width: squareSize,
          height: squareSize,
          border: `1px solid ${color}`,
          borderRadius: 1,
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: total,
        height: total,
      }}>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: shadowSize,
          height: shadowSize,
          background: shadowColor,
          borderRadius: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: squareSize,
          height: squareSize,
          border: `1px solid ${color}`,
          borderRadius: 1,
        }}
      />
    </div>
  );
}

export function textAccentIcon(value: string, color: string): ReactNode {
  const weight = value === 'low' ? 300 : value === 'medium' ? 500 : 700;
  const opacity = value === 'low' ? 0.35 : value === 'medium' ? 0.7 : 1;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: weight,
        color: color,
        opacity,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1,
      }}>
      Aa
    </span>
  );
}

const fontCategoryStyles: Record<string, { family: string; label: string; letterSpacing?: string; style?: string }> = {
  'sans-serif': {
    family: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    label: 'Aa',
  },
  serif: { family: "Georgia, 'Times New Roman', Times, serif", label: 'Aa' },
  mono: { family: "'SF Mono', 'Cascadia Code', Menlo, monospace", label: 'Aa' },
  slab: { family: "'Rockwell', 'Courier New', serif", label: 'Aa' },
  rounded: { family: "'Nunito', 'Varela Round', system-ui, sans-serif", label: 'Aa' },
  condensed: { family: "'Arial Narrow', sans-serif", label: 'Aa', letterSpacing: '-0.03em' },
  cursive: { family: "'Segoe Script', cursive", label: 'Aa', style: 'italic' },
  handwriting: { family: "'Comic Sans MS', 'Caveat', cursive", label: 'Aa' },
  pixel: { family: "'Courier New', monospace", label: 'Aa', letterSpacing: '0.05em' },
  blackletter: { family: "'Old English Text MT', serif", label: 'Aa' },
  geometric: { family: "'Century Gothic', 'Futura', sans-serif", label: 'Aa' },
};

export function headingFontIcon(value: string, color: string): ReactNode {
  const s = fontCategoryStyles[value] ?? { family: 'inherit', label: 'Aa' };
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: color,
        fontFamily: s.family,
        fontStyle: s.style,
        lineHeight: 1,
        letterSpacing: s.letterSpacing,
      }}>
      {s.label}
    </span>
  );
}

export function bodyFontIcon(value: string, color: string): ReactNode {
  const s = fontCategoryStyles[value] ?? { family: 'inherit', label: 'Aa' };
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 400,
        color: color,
        fontFamily: s.family,
        fontStyle: s.style,
        lineHeight: 1,
        letterSpacing: s.letterSpacing,
      }}>
      {s.label}
    </span>
  );
}

export function fontWeightIcon(value: string, color: string): ReactNode {
  const weight = ({ light: 300, regular: 400, bold: 700 } as Record<string, number>)[value] ?? 400;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: weight,
        color: color,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1,
      }}>
      W
    </span>
  );
}

export function modeIcon(value: 'system' | 'light' | 'dark', color: string): ReactNode {
  const base = { width: 14, height: 14, borderRadius: '50%' } as const;
  if (value === 'system') {
    return (
      <div
        style={{
          ...base,
          border: `1.5px solid ${color}`,
          background: `linear-gradient(90deg, ${color} 50%, transparent 50%)`,
        }}
      />
    );
  }
  if (value === 'light') {
    return <div style={{ ...base, border: `1.5px solid ${color}` }} />;
  }
  return <div style={{ ...base, background: color }} />;
}

/** Compact text glyph used by house-decision knobs in the panel. */
function glyph(label: string, color: string, size = 9): ReactNode {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 600,
        color,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
      {label}
    </span>
  );
}

export function fieldLabelPlacementIcon(value: string, color: string): ReactNode {
  if (value === 'side') {
    return glyph('⊟', color, 12);
  }
  if (value === 'floating') {
    return glyph('⬚', color, 12);
  }
  return glyph('⊞', color, 12); // top
}

export function requiredMarkingIcon(value: string, color: string): ReactNode {
  if (value === 'asterisk') {
    return glyph('*', color, 14);
  }
  if (value === 'optional') {
    return glyph('opt', color, 8);
  }
  return glyph('min', color, 8); // minority
}

export function tableZebraIcon(value: string, color: string): ReactNode {
  const on = value === 'on';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: 14 }}>
      <div style={{ height: 3, background: color, borderRadius: 1, opacity: on ? 1 : 0.35 }} />
      <div style={{ height: 3, background: color, borderRadius: 1, opacity: on ? 0.35 : 0.35 }} />
      <div style={{ height: 3, background: color, borderRadius: 1, opacity: on ? 1 : 0.35 }} />
    </div>
  );
}

export function bulkBarPlacementIcon(value: string, color: string): ReactNode {
  const top = value !== 'bottom';
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `1px solid ${color}`,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: top ? 'flex-start' : 'flex-end',
        padding: 1,
      }}>
      <div style={{ height: 3, background: color, borderRadius: 1 }} />
    </div>
  );
}

export function selectAllScopeIcon(value: string, color: string): ReactNode {
  const filtered = value === 'filtered';
  // Three rows; page scope highlights only the top rows (current page),
  // filtered scope highlights all rows (all matching).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: 14 }}>
      <div style={{ height: 3, background: color, borderRadius: 1 }} />
      <div style={{ height: 3, background: color, borderRadius: 1 }} />
      <div style={{ height: 3, background: color, borderRadius: 1, opacity: filtered ? 1 : 0.3 }} />
    </div>
  );
}

export function timestampStyleIcon(value: string, color: string): ReactNode {
  return glyph(value === 'relative' ? '~t' : '12:00', color, value === 'relative' ? 10 : 7);
}

export function disabledStyleIcon(value: string, color: string): ReactNode {
  if (value === 'dimWhole') {
    return <div style={{ width: 14, height: 14, background: color, borderRadius: 2, opacity: 0.35 }} />;
  }
  // keepLabel — solid label bar over a dimmed body
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 14 }}>
      <div style={{ height: 3, background: color, borderRadius: 1 }} />
      <div style={{ height: 7, background: color, borderRadius: 1, opacity: 0.3 }} />
    </div>
  );
}

export function formAutofocusIcon(value: string, color: string): ReactNode {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `1.5px solid ${color}`,
        borderRadius: 2,
        boxShadow: value === 'on' ? `0 0 0 2px ${color}` : undefined,
        opacity: value === 'on' ? 1 : 0.45,
      }}
    />
  );
}
