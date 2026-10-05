import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
/**
 * House Heading knob wiring — headingFont / fontWeight reach every
 * heading's TEXT NODE and pageTitleScale re-steps H1, on the props channel
 * that serves every platform.
 *
 * Measurement discipline: assertions read the TEXT NODE — the
 * H1/H2/span element `screen.getByText` returns, tag-guarded — never a
 * wrapping frame. jsdom/happy-dom cannot cascade Tamagui's class-based CSS,
 * so the specs compare atomic style classes (`_fow-` weight, `_fos-`/`_lh-`
 * size step — the pageTitleScale.test.tsx technique) and the font-scope
 * class (`font_heading` / `font_mono`) for family, between knob flips and
 * against explicit-prop renders of the same value. Hashed class names are
 * compared by identity only.
 *
 * This file is the WEB arm (the default module graph). The NATIVE arm is
 * ./Heading.native.test.tsx, a separate FILE so that a file-scoped `vi.mock`
 * gives it one coherent module graph. FontKnobStyles' web-only CSS rescue is
 * mounted in NEITHER arm, so flips reaching the node prove the props channel
 * — the only channel native has.
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { H1, H2, H3, Heading } from './Heading';

afterEach(cleanup);

const TITLE = 'Workspace Settings';

function classesByPrefix(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

/** Tamagui font-scope class on the TEXT NODE (`font_heading` / `font_mono` / …). */
function fontScopeClass(el: Element): string {
  return (
    String((el as HTMLElement).className || '')
      .split(' ')
      .find((c) => c.startsWith('font_')) ?? ''
  );
}

/** Render, guard the text node's tag, read its prefixed classes, clean up. */
function renderHeadingClasses(node: React.ReactElement, prefixes: string[], expectedTag?: string): string[] {
  renderWithProviders(node);
  const textNode = screen.getByText(TITLE);
  if (expectedTag) {
    // The text node IS the heading element — not a frame around it.
    expect(textNode.tagName).toBe(expectedTag);
  }
  const classes = classesByPrefix(textNode, prefixes);
  cleanup();
  return classes;
}

describe('house Heading — fontWeight reaches the heading text node', () => {
  it('changes weight on a fontWeight flip, pinned to 400/700', () => {
    const regular = renderHeadingClasses(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Heading>{TITLE}</Heading>
      </Preset>,
      ['_fow-'],
    );
    const bold = renderHeadingClasses(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Heading>{TITLE}</Heading>
      </Preset>,
      ['_fow-'],
    );
    const explicit400 = renderHeadingClasses(<Heading fontWeight="400">{TITLE}</Heading>, ['_fow-']);
    const explicit700 = renderHeadingClasses(<Heading fontWeight="700">{TITLE}</Heading>, ['_fow-']);
    expect(regular).not.toHaveLength(0);
    expect(regular).not.toEqual(bold);
    expect(regular).toEqual(explicit400);
    expect(bold).toEqual(explicit700);
  });

  it('H1 changes weight on the same flip (the page title is a heading too)', () => {
    const regular = renderHeadingClasses(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <H1>{TITLE}</H1>
      </Preset>,
      ['_fow-'],
      'H1',
    );
    const bold = renderHeadingClasses(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <H1>{TITLE}</H1>
      </Preset>,
      ['_fow-'],
      'H1',
    );
    const explicit400 = renderHeadingClasses(<H1 fontWeight="400">{TITLE}</H1>, ['_fow-'], 'H1');
    const explicit700 = renderHeadingClasses(<H1 fontWeight="700">{TITLE}</H1>, ['_fow-'], 'H1');
    expect(regular).not.toHaveLength(0);
    expect(regular).not.toEqual(bold);
    expect(regular).toEqual(explicit400);
    expect(bold).toEqual(explicit700);
  });

  it('changes family on a headingFont flip (props, not the web-only CSS rescue)', () => {
    const scope = (node: React.ReactElement) => {
      renderWithProviders(node);
      const cls = fontScopeClass(screen.getByText(TITLE));
      cleanup();
      return cls;
    };
    const sans = scope(
      <Preset overrides={{ headingFont: 'sans-serif' }}>
        <Heading>{TITLE}</Heading>
      </Preset>,
    );
    const mono = scope(
      <Preset overrides={{ headingFont: 'mono' }}>
        <Heading>{TITLE}</Heading>
      </Preset>,
    );
    expect(sans).toBe('font_heading');
    expect(mono).toBe('font_mono');
  });
});

describe('house H3 — subordinate headings are mono 400 on the TEXT NODE', () => {
  it('pins family and weight to mono 400, ignoring heading knobs', () => {
    const byDefault = renderHeadingClasses(<H3>{TITLE}</H3>, ['_fow-'], 'H3');
    const explicit = renderHeadingClasses(
      <H3 fontFamily="$mono" fontWeight="400">
        {TITLE}
      </H3>,
      ['_fow-'],
      'H3',
    );
    const headingSans = renderHeadingClasses(
      <Preset overrides={{ headingFont: 'sans-serif', fontWeight: 'bold' }}>
        <H3>{TITLE}</H3>
      </Preset>,
      ['_fow-'],
      'H3',
    );
    expect(byDefault).not.toHaveLength(0);
    expect(byDefault).toEqual(explicit);
    expect(headingSans).toEqual(explicit);

    renderWithProviders(<H3>{TITLE}</H3>);
    expect(fontScopeClass(screen.getByText(TITLE))).toBe('font_mono');
    cleanup();
  });

  it('consumer eject still wins over the house pin (STD-EJECT-LAST)', () => {
    const ejected = renderHeadingClasses(
      <H3 fontFamily="$heading" fontWeight="700">
        {TITLE}
      </H3>,
      ['_ff-', '_fow-'],
      'H3',
    );
    const explicit = renderHeadingClasses(
      <H3 fontFamily="$heading" fontWeight="700">
        {TITLE}
      </H3>,
      ['_ff-', '_fow-'],
      'H3',
    );
    expect(ejected).toEqual(explicit);
    expect(ejected).not.toEqual(renderHeadingClasses(<H3>{TITLE}</H3>, ['_ff-', '_fow-'], 'H3'));
  });
});

describe('house H1 — pageTitleScale reaches the title text node', () => {
  it('changes size on a pageTitleScale flip, and moderate is the default', () => {
    const byDefault = renderHeadingClasses(<H1>{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    const moderate = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'moderate' }}>
        <H1>{TITLE}</H1>
      </Preset>,
      ['_fos-', '_lh-'],
      'H1',
    );
    const display = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <H1>{TITLE}</H1>
      </Preset>,
      ['_fos-', '_lh-'],
      'H1',
    );
    expect(byDefault).not.toHaveLength(0);
    expect(byDefault).toEqual(moderate);
    expect(byDefault).not.toEqual(display);
  });

  it('resolves through the one page-title table: the knob equals the explicit size step', () => {
    // moderate → $8, display → $10 on the heading scale (resolveKnobs
    // pageTitleSizeMap). Identity against explicit size props pins the
    // fragment to the table without hardcoding hashed classes or px.
    const moderate = renderHeadingClasses(<H1>{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    const explicit8 = renderHeadingClasses(<H1 size="$8">{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    const display = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <H1>{TITLE}</H1>
      </Preset>,
      ['_fos-', '_lh-'],
      'H1',
    );
    const explicit10 = renderHeadingClasses(<H1 size="$10">{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    expect(moderate).toEqual(explicit8);
    expect(display).toEqual(explicit10);
  });

  it("does NOT re-step H2 — the dial is the page title's, not every heading's", () => {
    const moderate = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'moderate' }}>
        <H2>{TITLE}</H2>
      </Preset>,
      ['_fos-', '_lh-'],
      'H2',
    );
    const display = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <H2>{TITLE}</H2>
      </Preset>,
      ['_fos-', '_lh-'],
      'H2',
    );
    expect(moderate).toEqual(display);
  });

  it('the per-instance eject still wins over the knob (PageHeader contract)', () => {
    const ejected = renderHeadingClasses(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <H1 size="$8">{TITLE}</H1>
      </Preset>,
      ['_fos-', '_lh-'],
      'H1',
    );
    const moderate = renderHeadingClasses(<H1>{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    expect(ejected).toEqual(moderate);
  });
});

// The NATIVE arm lives in ./Heading.native.test.tsx. It used to sit here as a
// `vi.resetModules()` + dynamic-import block, but that returned a SPLIT module
// graph in which the knob overrides never reached the heading, so both sides
// of the flip measured `_fow-400` and the assertion passed a knob-dead render.
// A file-scoped `vi.mock` in its own spec file is one coherent graph.
