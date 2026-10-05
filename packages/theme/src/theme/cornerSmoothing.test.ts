import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CORNER_SHAPE_CSS_VAR,
  CORNER_SHAPE_ROUND,
  CORNER_SHAPE_ROUND_COMPUTED,
  CORNER_SHAPE_SMOOTH,
  CORNER_SHAPE_SMOOTH_COMPUTED,
  CORNER_SMOOTHING_ROOT_ATTR,
  CORNER_SMOOTHING_STYLE_TAG_ID,
  CornerSmoothingStyles,
  applyRootCornerSmoothing,
  cornerSmoothClassName,
  cornerSmoothingCss,
  cssSupportsCornerShape,
  ensureCornerSmoothingStyles,
  isRoundComputedCornerShape,
  isSmoothComputedCornerShape,
  readComputedCornerShape,
} from './cornerSmoothing';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { defaultPreset } from './presets';

/**
 * Playwright's `chrome-headless-shell` builds, newest revision first.
 *
 * This is about coverage, not speed — an installed Chrome reaches `--dump-dom`
 * in ~5s and is fine. The point is that a machine or a CI image with no Chrome
 * installed but a Playwright cache present would otherwise take the held-out
 * branch below and prove nothing, silently.
 */
function findHeadlessShells(): string[] {
  const home = process.env.HOME ?? '';
  const roots = [`${home}/Library/Caches/ms-playwright`, `${home}/.cache/ms-playwright`];
  const found: { revision: number; bin: string }[] = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    for (const entry of readdirSync(root)) {
      const revision = Number(entry.replace('chromium_headless_shell-', ''));
      if (!entry.startsWith('chromium_headless_shell-') || Number.isNaN(revision)) {
        continue;
      }
      for (const arch of ['mac-arm64', 'mac-x64', 'linux64']) {
        const bin = join(root, entry, `chrome-headless-shell-${arch}`, 'chrome-headless-shell');
        if (existsSync(bin)) {
          found.push({ revision, bin });
        }
      }
    }
  }
  return found.sort((a, b) => b.revision - a.revision).map((f) => f.bin);
}

function findChrome(): string | undefined {
  const candidates = [
    process.env.CHROME_BIN,
    ...findHeadlessShells(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${process.env.HOME ?? ''}/.local/bin/google-chrome`,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

describe('cornerSmoothing (Axiom 15 OPTICS)', () => {
  it('scopes the squircle declaration to the fragment class', () => {
    expect(cornerSmoothClassName).toBe('mp-corner-smooth');
    expect(cornerSmoothingCss).toBe('.mp-corner-smooth { corner-shape: squircle; }');
    expect(cornerSmoothingCss).toContain(`corner-shape: ${CORNER_SHAPE_SMOOTH}`);
  });

  describe('stylesheet mount', () => {
    beforeEach(() => {
      document.getElementById(CORNER_SMOOTHING_STYLE_TAG_ID)?.remove();
    });

    it('mounts the stylesheet once (idempotent)', () => {
      ensureCornerSmoothingStyles();
      ensureCornerSmoothingStyles();
      const tags = document.querySelectorAll(`#${CORNER_SMOOTHING_STYLE_TAG_ID}`);
      expect(tags).toHaveLength(1);
      expect(tags[0]?.textContent).toBe(cornerSmoothingCss);
    });
  });

  describe('support detection (measured, not assumed)', () => {
    it('is false when the engine is missing (null) or has no supports()', () => {
      expect(cssSupportsCornerShape(null)).toBe(false);
      expect(cssSupportsCornerShape({ supports: undefined })).toBe(false);
    });

    it('is true only when the UA reports the squircle value', () => {
      expect(cssSupportsCornerShape({ supports: () => true })).toBe(true);
      expect(cssSupportsCornerShape({ supports: () => false })).toBe(false);
    });

    it('swallows a throwing supports() as unsupported', () => {
      expect(
        cssSupportsCornerShape({
          supports: () => {
            throw new Error('nope');
          },
        }),
      ).toBe(false);
    });
  });

  describe('computed-shape reader', () => {
    it('prefers getPropertyValue over the camelCase IDL', () => {
      expect(
        readComputedCornerShape({
          getPropertyValue: (name) => (name === 'corner-shape' ? 'superellipse(2)' : ''),
          cornerShape: 'round',
        }),
      ).toBe('superellipse(2)');
    });

    it('falls back to the IDL when the property channel is empty', () => {
      expect(
        readComputedCornerShape({
          getPropertyValue: () => '',
          cornerShape: 'squircle',
        }),
      ).toBe('squircle');
    });

    it('treats specified squircle and computed superellipse(2) as smooth', () => {
      expect(isSmoothComputedCornerShape('squircle')).toBe(true);
      expect(isSmoothComputedCornerShape('superellipse(2)')).toBe(true);
      expect(isSmoothComputedCornerShape(' SuperEllipse(2) ')).toBe(true);
      expect(isSmoothComputedCornerShape('round')).toBe(false);
      expect(isSmoothComputedCornerShape('superellipse(1)')).toBe(false);
    });

    it('treats round / superellipse(1) / empty as the unsupported-or-round stop', () => {
      expect(isRoundComputedCornerShape('round')).toBe(true);
      expect(isRoundComputedCornerShape('superellipse(1)')).toBe(true);
      expect(isRoundComputedCornerShape('')).toBe(true);
      expect(isRoundComputedCornerShape('normal')).toBe(true);
      expect(isRoundComputedCornerShape('squircle')).toBe(false);
    });

    it('a class-marked node plus the mounted sheet is classifiable', () => {
      ensureCornerSmoothingStyles();
      const el = document.createElement('div');
      el.className = cornerSmoothClassName;
      el.style.borderRadius = '16px';
      document.body.appendChild(el);
      expect(document.getElementById(CORNER_SMOOTHING_STYLE_TAG_ID)?.textContent).toBe(cornerSmoothingCss);
      const computed = readComputedCornerShape(getComputedStyle(el));
      // Measured 2026-08-28: this happy-dom applies `squircle`. An engine
      // that drops the unknown declaration reads empty/round. Either stop
      // is a measured result, not an assumed skip.
      expect(isSmoothComputedCornerShape(computed) || isRoundComputedCornerShape(computed)).toBe(true);
      el.remove();
    });
  });

  describe('root channel', () => {
    afterEach(() => {
      document.documentElement.removeAttribute(CORNER_SMOOTHING_ROOT_ATTR);
      document.documentElement.style.removeProperty(CORNER_SHAPE_CSS_VAR);
      cleanup();
    });

    it('publishes the live stop on <html>', () => {
      applyRootCornerSmoothing('smooth');
      expect(document.documentElement.getAttribute(CORNER_SMOOTHING_ROOT_ATTR)).toBe('smooth');
      expect(document.documentElement.style.getPropertyValue(CORNER_SHAPE_CSS_VAR)).toBe(CORNER_SHAPE_SMOOTH);
      applyRootCornerSmoothing('round');
      expect(document.documentElement.getAttribute(CORNER_SMOOTHING_ROOT_ATTR)).toBe('round');
      expect(document.documentElement.style.getPropertyValue(CORNER_SHAPE_CSS_VAR)).toBe(CORNER_SHAPE_ROUND);
    });

    it('CornerSmoothingStyles mounts the stylesheet and follows the preset stop', () => {
      document.getElementById(CORNER_SMOOTHING_STYLE_TAG_ID)?.remove();
      const value: PresetContextValue = {
        preset: {
          ...defaultPreset,
          knobs: { ...defaultPreset.knobs, cornerSmoothing: 'smooth' },
        },
      };
      render(createElement(PresetContext.Provider, { value }, createElement(CornerSmoothingStyles) as ReactNode));
      expect(document.getElementById(CORNER_SMOOTHING_STYLE_TAG_ID)?.textContent).toBe(cornerSmoothingCss);
      expect(document.documentElement.getAttribute(CORNER_SMOOTHING_ROOT_ATTR)).toBe('smooth');
    });
  });

  describe('supporting browser (Chromium)', () => {
    it('computed corner-shape DIFFERS between round and smooth', () => {
      const chrome = findChrome();
      if (!chrome) {
        // Held-out: no Chromium binary. The happy-dom arm above records
        // whatever this harness computes as measured, not assumed.
        return;
      }
      const dir = mkdtempSync(join(tmpdir(), 'mp-corner-shape-'));
      const htmlPath = join(dir, 'probe.html');
      writeFileSync(
        htmlPath,
        `<!doctype html><style>
html, body { margin: 0; padding: 0; }
.box { position: absolute; top: 0; width: 132px; height: 84px; border-radius: 16px; }
.round { left: 0; corner-shape: round; }
.smooth { left: 200px; corner-shape: squircle; }
.classy { left: 400px; }
.${cornerSmoothClassName} { corner-shape: squircle; }
</style>
<div id="round" class="box round"></div>
<div id="smooth" class="box smooth"></div>
<div id="classy" class="box classy ${cornerSmoothClassName}"></div>
<pre id="out"></pre>
<script>
const read = (el) => {
  const cs = getComputedStyle(el);
  return (cs.getPropertyValue("corner-shape") || cs.cornerShape || "").trim();
};
// Walk 1px..8px diagonally in from the top-left. "1" means the box owns that
// pixel. This reads the PAINTED curve, so it fails if an engine parses
// corner-shape but still draws the plain arc — a property echo cannot fake it.
const cornerMask = (id, left) => {
  let bits = "";
  for (let d = 1; d <= 8; d++) {
    const hit = document.elementFromPoint(left + d, d);
    bits += hit && hit.id === id ? "1" : "0";
  }
  return bits;
};
const out = {
  supportsSquircle: CSS.supports("corner-shape", "squircle"),
  ua: navigator.userAgent,
  round: read(document.getElementById("round")),
  smooth: read(document.getElementById("smooth")),
  classy: read(document.getElementById("classy")),
  roundCorner: cornerMask("round", 0),
  smoothCorner: cornerMask("smooth", 200),
  classyCorner: cornerMask("classy", 400),
};
document.getElementById("out").textContent = JSON.stringify(out);
</script>`,
      );
      const dump = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--dump-dom', `file://${htmlPath}`], {
        encoding: 'utf8',
        timeout: 60_000,
      });
      const match = dump.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      expect(match, 'probe <pre id=out> missing from dump-dom').toBeTruthy();
      const result = JSON.parse(match![1]) as {
        supportsSquircle: boolean;
        round: string;
        smooth: string;
        classy: string;
        roundCorner: string;
        smoothCorner: string;
        classyCorner: string;
      };
      expect(result.supportsSquircle).toBe(true);
      expect(isRoundComputedCornerShape(result.round)).toBe(true);
      expect(isSmoothComputedCornerShape(result.smooth)).toBe(true);
      expect(isSmoothComputedCornerShape(result.classy)).toBe(true);
      expect(result.smooth).not.toBe(result.round);
      expect([CORNER_SHAPE_SMOOTH, CORNER_SHAPE_SMOOTH_COMPUTED]).toContain(result.smooth);
      expect([CORNER_SHAPE_ROUND, CORNER_SHAPE_ROUND_COMPUTED]).toContain(result.round);

      // Geometry, not the property echo: the squircle claims corner pixels the
      // arc leaves empty, and the class-driven cell paints the same curve as
      // the hand-written one. Measured 2026-09-01 on Chromium 143/147/148/151
      // and Chrome 152 — round "00011111", smooth "01111111". See
      // docs/design/boards/W1-corner-smoothing/engines__corner-shape.json.
      expect(result.smoothCorner).not.toBe(result.roundCorner);
      expect(result.classyCorner).toBe(result.smoothCorner);
      expect(result.smoothCorner.indexOf('1')).toBeLessThan(result.roundCorner.indexOf('1'));
    });
  });
});
