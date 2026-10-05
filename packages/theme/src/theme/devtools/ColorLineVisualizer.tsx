/**
 * Color palette visualizer for devtools.
 *
 * Shows the 12-step color scale with semantic group brackets (Background,
 * UI Background, Border, Primary, Text) all on a single row above the bar.
 */

import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { semanticGroups } from '../colorRules';
import type { Knobs } from '../knobs';

import { contrastTextFor, cellSize } from './vizConstants';

// ── Helpers ──────────────────────────────────────────────────

function readColorsFromElement(el: Element): string[] | null {
  const style = getComputedStyle(el);
  const result: string[] = [];
  let found = false;
  for (let i = 1; i <= 12; i++) {
    let color = style.getPropertyValue(`--color${i}`).trim();
    if (!color) {
      color = style.getPropertyValue(`--color-${i}`).trim();
    }
    if (color) {
      found = true;
      result.push(color);
    } else {
      result.push(fallbackGradient()[i - 1]);
    }
  }
  return found ? result : null;
}

function useDomThemeColors(): string[] {
  const [colors, setColors] = useState<string[]>(() => fallbackGradient());

  useEffect(() => {
    const readColors = () => {
      let result = readColorsFromElement(document.documentElement);
      if (!result && document.body) {
        result = readColorsFromElement(document.body);
      }
      if (!result) {
        const themed = document.querySelector('[class*="t_"]');
        if (themed) {
          result = readColorsFromElement(themed);
        }
      }
      if (!result) {
        const root = document.getElementById('root') || document.getElementById('__next');
        if (root) {
          result = readColorsFromElement(root);
        }
      }
      if (result) {
        setColors(result);
      }
    };

    readColors();
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        subtree: true,
      });
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return colors;
}

function fallbackGradient(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const v = Math.round(240 - t * 200);
    return `rgb(${v},${v},${v})`;
  });
}

// ── Sub-components ──────────────────────────────────────────

function NumberLineRow({ colorFor, compact }: { colorFor: (step: number) => string; compact?: boolean }) {
  const h = compact ? Math.round(cellSize / 2) : cellSize;
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {Array.from({ length: 12 }, (_, i) => {
        const step = i + 1;
        const background = colorFor(step);
        return (
          <div
            key={step}
            style={{
              width: cellSize,
              height: h,
              flexShrink: 0,
              background: background,
              color: contrastTextFor(background),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 9 : 11,
              fontWeight: 700,
            }}
            title={`$color${step}`}>
            {step}
          </div>
        );
      })}
    </div>
  );
}

/** All semantic group brackets rendered on a single row above the color bar. */
function SemanticBrackets() {
  const totalWidth = 12 * cellSize;
  return (
    <div style={{ position: 'relative', height: 24, width: totalWidth, marginBottom: 2 }}>
      {semanticGroups.map((g) => {
        const leftPx = (g.from - 1) * cellSize;
        const widthPx = (g.to - g.from + 1) * cellSize;
        return (
          <div
            key={g.key}
            style={{
              position: 'absolute',
              left: leftPx,
              width: widthPx,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
            }}>
            <div
              style={{
                textAlign: 'center',
                fontSize: 9,
                fontWeight: 600,
                color: g.color,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}>
              {g.label}
            </div>
            <div
              style={{
                height: 6,
                borderLeft: `2px solid ${g.color}`,
                borderRight: `2px solid ${g.color}`,
                borderTop: `2px solid ${g.color}`,
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

function createVizStyles(isDark: boolean) {
  const border = isDark ? '#333' : '#ddd';
  const mutedText = isDark ? '#888' : '#999';
  const foreground = isDark ? '#e8e8e8' : '#1a1a1a';
  const cardBackground = isDark ? '#1e1e1e' : '#fafafa';

  return {
    container: {
      display: 'flex' as const,
      flexDirection: 'column' as const,
      gap: 6,
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${border}`,
      background: cardBackground,
      width: 'fit-content' as const,
      fontSize: 11,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: foreground,
    },
    title: {
      fontSize: 13,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
      color: mutedText,
    },
  };
}

// ── Main component ──────────────────────────────────────────

export interface ColorLineVisualizerProps {
  knobs: Knobs;
  isDark: boolean;
  themeColors?: string[];
  oppositeThemeColors?: string[];
  accentColors?: string[];
  oppositeAccentColors?: string[];
}

export function ColorLineVisualizer({
  knobs: _knobs,
  isDark,
  themeColors: propColors,
  oppositeThemeColors: propOppositeColors,
  accentColors: propAccentColors,
  oppositeAccentColors: propOppositeAccentColors,
}: ColorLineVisualizerProps) {
  const domColors = useDomThemeColors();
  const themeColors = propColors && propColors.length === 12 ? propColors : domColors;
  const styles = useMemo(() => createVizStyles(isDark), [isDark]);

  const toColorFn =
    (arr: string[]) =>
    (step: number): string =>
      arr[Math.min(11, Math.max(0, step - 1))];

  const colorFor = toColorFn(themeColors);
  const oppositeColors = propOppositeColors && propOppositeColors.length === 12 ? propOppositeColors : null;
  const accentColors = propAccentColors && propAccentColors.length === 12 ? propAccentColors : null;
  const oppositeAccentColors =
    propOppositeAccentColors && propOppositeAccentColors.length === 12 ? propOppositeAccentColors : null;

  return (
    <div style={styles.container}>
      <div style={styles.title as CSSProperties}>Theme</div>
      <SemanticBrackets />
      <NumberLineRow colorFor={colorFor} />
      {oppositeColors && <NumberLineRow colorFor={toColorFn(oppositeColors)} compact />}
      {accentColors && (
        <>
          <div
            style={{
              ...(styles.title as CSSProperties),
              fontSize: 11,
              marginTop: 6,
            }}>
            accent
          </div>
          <NumberLineRow colorFor={toColorFn(accentColors)} />
          {oppositeAccentColors && <NumberLineRow colorFor={toColorFn(oppositeAccentColors)} compact />}
        </>
      )}
    </div>
  );
}
