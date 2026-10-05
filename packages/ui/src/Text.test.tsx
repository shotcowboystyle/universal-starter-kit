import { renderWithProviders } from '@repo/test-utils';
import { Preset, useAccentOnSurface } from '@repo/theme';
/**
 * House Text knob wiring — bodyFont / fontWeight / textAccent reach
 * the TEXT NODE, on the props channel that serves every platform.
 *
 * Measurement discipline: every font/weight/ink
 * assertion here reads the TEXT NODE — the element `screen.getByText`
 * returns, guarded to not be the wrapping frame — never the frame. jsdom/
 * happy-dom cannot cascade Tamagui's class-based CSS, so assertions compare
 * the atomic style classes the props emit on that node (`_col-` color,
 * `_fow-` fontWeight, `_fos-`/`_lh-` size — the pageTitleScale.test.tsx
 * technique) and the font-scope class (`font_body` / `font_mono`) for
 * family. Between knob flips and against explicit-prop renders of the
 * same value. Hashed class names are compared by identity only.
 *
 * This file is the WEB arm (the default module graph, isWeb true). The NATIVE
 * arm is ./Text.native.test.tsx, a separate FILE so that a file-scoped
 * `vi.mock` gives it one coherent module graph. FontKnobStyles' CSS-variable
 * rescue is absent in BOTH arms (renderWithProviders mounts no theme
 * provider), so a flip that reaches the node proves the PROPS channel — the
 * only channel native has.
 */
import { cleanup, screen } from '@testing-library/react';
import { XStack } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Anchor, Text } from './Text';

afterEach(cleanup);

const LABEL = 'Measure the text node';

function classesByPrefix(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

/** Tamagui font-scope class on the TEXT NODE (`font_body` / `font_mono` / …). */
function fontScopeClass(el: Element): string {
  return (
    String((el as HTMLElement).className || '')
      .split(' ')
      .find((c) => c.startsWith('font_')) ?? ''
  );
}

/** Render, read the TEXT NODE's prefixed classes, clean up. */
function renderTextClasses(node: React.ReactElement, prefixes: string[]): string[] {
  renderWithProviders(node);
  const textNode = screen.getByText(LABEL);
  const classes = classesByPrefix(textNode, prefixes);
  cleanup();
  return classes;
}

describe('house Text — textAccent reaches the text node', () => {
  it('changes colour on a textAccent flip', () => {
    const high = renderTextClasses(
      <Preset overrides={{ textAccent: 'high' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_col-'],
    );
    const low = renderTextClasses(
      <Preset overrides={{ textAccent: 'low' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_col-'],
    );
    expect(high).not.toHaveLength(0);
    expect(low).not.toHaveLength(0);
    expect(high).not.toEqual(low);
  });

  it('low and medium share the AA legibility floor ($color11)', () => {
    const low = renderTextClasses(
      <Preset overrides={{ textAccent: 'low' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_col-'],
    );
    const medium = renderTextClasses(
      <Preset overrides={{ textAccent: 'medium' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_col-'],
    );
    expect(low).toEqual(medium);
  });

  it('measures the TEXT NODE, never the frame', () => {
    renderWithProviders(
      <XStack data-testid="frame">
        <Text>{LABEL}</Text>
      </XStack>,
    );
    const textNode = screen.getByText(LABEL);
    const frame = screen.getByTestId('frame');
    expect(textNode).not.toBe(frame);
    expect(frame.contains(textNode)).toBe(true);
    // The ink/weight/family live on the text node; the frame carries none.
    expect(classesByPrefix(textNode, ['_col-', '_fow-', '_ff-'])).not.toHaveLength(0);
    expect(classesByPrefix(frame, ['_col-', '_fow-', '_ff-'])).toHaveLength(0);
  });
});

describe('house Text — fontWeight and bodyFont reach the text node', () => {
  it('changes weight on a fontWeight flip, pinned to the 400/700 label law', () => {
    const regular = renderTextClasses(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_fow-'],
    );
    const bold = renderTextClasses(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Text>{LABEL}</Text>
      </Preset>,
      ['_fow-'],
    );
    // Identity-pin the values without hardcoding hashed class names: the
    // knob's rendering must equal an explicit render of the lawful weight
    // (labels are 400, bold 700 — 500/600 are not label weights).
    const explicit400 = renderTextClasses(<Text fontWeight="400">{LABEL}</Text>, ['_fow-']);
    const explicit700 = renderTextClasses(<Text fontWeight="700">{LABEL}</Text>, ['_fow-']);
    expect(regular).not.toHaveLength(0);
    expect(regular).not.toEqual(bold);
    expect(regular).toEqual(explicit400);
    expect(bold).toEqual(explicit700);
  });

  it('changes family on a bodyFont flip (props, not the web-only CSS rescue)', () => {
    // Family lives on the font-scope class (`font_body` / `font_mono`), not
    // the shared `_ff-f-family` token class — measure that on the TEXT NODE.
    const scope = (node: React.ReactElement) => {
      renderWithProviders(node);
      const cls = fontScopeClass(screen.getByText(LABEL));
      cleanup();
      return cls;
    };
    const sans = scope(
      <Preset overrides={{ bodyFont: 'sans-serif' }}>
        <Text>{LABEL}</Text>
      </Preset>,
    );
    const mono = scope(
      <Preset overrides={{ bodyFont: 'mono' }}>
        <Text>{LABEL}</Text>
      </Preset>,
    );
    expect(sans).toBe('font_body');
    expect(mono).toBe('font_mono');
  });

  it('default label ramp is 400 at 14/25 on the TEXT NODE', () => {
    // $4 / $true labels are Inter 14/25
    // weight 400. Identity-pin against an explicit render so hashed classes
    // never leak into the assertion.
    const byDefault = renderTextClasses(<Text>{LABEL}</Text>, ['_fos-', '_lh-', '_fow-']);
    const explicit = renderTextClasses(
      <Text fontSize={14} lineHeight={25} fontWeight="400">
        {LABEL}
      </Text>,
      ['_fos-', '_lh-', '_fow-'],
    );
    expect(byDefault).not.toHaveLength(0);
    expect(byDefault).toEqual(explicit);
  });

  it('explicit consumer props still eject (STD-EJECT-LAST)', () => {
    const ejected = renderTextClasses(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Text fontWeight="400">{LABEL}</Text>
      </Preset>,
      ['_fow-'],
    );
    const explicit400 = renderTextClasses(<Text fontWeight="400">{LABEL}</Text>, ['_fow-']);
    expect(ejected).toEqual(explicit400);
  });
});

describe("house Anchor — link chrome is house Text's, in the accent", () => {
  function AccentProbe({ onInk }: { onInk: (ink: string) => void }) {
    onInk(useAccentOnSurface());
    return null;
  }

  it("paints the AA-safe accent ink, not tamagui's link colour", () => {
    let ink = '';
    const anchor = renderTextClasses(
      <>
        <AccentProbe onInk={(value) => (ink = value)} />
        <Anchor href="#">{LABEL}</Anchor>
      </>,
      ['_col-'],
    );
    expect(ink).not.toBe('');
    const accented = renderTextClasses(<Anchor color={ink as never}>{LABEL}</Anchor>, ['_col-']);
    const body = renderTextClasses(<Text>{LABEL}</Text>, ['_col-']);
    expect(anchor).not.toHaveLength(0);
    expect(anchor).toEqual(accented);
    expect(anchor).not.toEqual(body);
  });

  it('a consumer colour still ejects (STD-EJECT-LAST)', () => {
    const ejected = renderTextClasses(<Anchor color="$color9">{LABEL}</Anchor>, ['_col-']);
    const explicit = renderTextClasses(<Text color="$color9">{LABEL}</Text>, ['_col-']);
    expect(ejected).toEqual(explicit);
  });
});

// The NATIVE arm lives in ./Text.native.test.tsx. It used to sit here as a
// `vi.resetModules()` + dynamic-import block, but that returned a SPLIT module
// graph — a fresh `renderWithProviders` over a stale `useResolvedKnobs` — and
// threw "Missing theme." instead of measuring anything. A file-scoped
// `vi.mock` in its own spec file is one coherent graph.
