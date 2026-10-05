import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
/**
 * House Heading knob wiring, NATIVE arm.
 *
 * Why this lives in its OWN file. The arm originally sat inside
 * `Heading.test.tsx` as a `vi.resetModules()` + dynamic-import block whose
 * comment promised "everything must come from the SAME fresh graph". It did
 * not: measured on origin/main, after `vi.resetModules()` the re-imported
 * `@repo/test-utils` was a NEW instance while
 * `@repo/theme` came back as the ORIGINAL one
 * (`Preset === Preset` true, `renderWithProviders === renderWithProviders`
 * false). So the fresh `renderWithProviders` mounted a fresh TamaguiProvider
 * whose theme context the stale `useResolvedKnobs` never read: the Text arm
 * threw "Missing theme.", and the Heading arm silently fell back to the
 * DEFAULT preset for both sides of the flip and compared `_fow-400` with
 * `_fow-400`. A knob-dead component would have passed that assertion the same
 * way — the exact class of hole earlier regressions came from.
 *
 * One spec FILE is one module registry in vitest, so a file-scoped
 * `vi.mock` applies the native platform to the WHOLE graph — theme,
 * test-utils and tamagui included — with no resetModules gymnastics.
 *
 * What the arm proves and what it does not. `renderWithProviders` leaves the
 * mpo ThemeProvider off by default, so FontKnobStyles' web-only CSS-variable
 * rescue is mounted in NEITHER arm; the props channel is the only channel
 * carrying the knob here, which is the channel native has. It does NOT
 * execute the React Native renderer — it is the standing substitute for a
 * simulator capture, not a
 * replacement for one.
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { H1, H3, Heading } from './Heading';

vi.mock('@repo/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  isWeb: false,
  isNative: true,
}));

afterEach(cleanup);

const TITLE = 'Workspace Settings';

function classesByPrefix(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
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

describe('house Heading — NATIVE environment (isWeb false)', () => {
  it('really is running with the native platform flags', async () => {
    const platform = await import('@repo/platform');
    expect(platform.isWeb).toBe(false);
    expect(platform.isNative).toBe(true);
  });

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

  it('H1 changes size on a pageTitleScale flip, resolved through the page-title table', () => {
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
    const explicit8 = renderHeadingClasses(<H1 size="$8">{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    const explicit10 = renderHeadingClasses(<H1 size="$10">{TITLE}</H1>, ['_fos-', '_lh-'], 'H1');
    expect(moderate).not.toHaveLength(0);
    expect(moderate).not.toEqual(display);
    expect(moderate).toEqual(explicit8);
    expect(display).toEqual(explicit10);
  });

  it('H1 carries the fontWeight flip too — pageTitle does not swallow it', () => {
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
    expect(regular).not.toHaveLength(0);
    expect(regular).not.toEqual(bold);
  });

  it('H3 stays mono 400 — subordinate headings ignore the heading knobs', () => {
    const byDefault = renderHeadingClasses(<H3>{TITLE}</H3>, ['_fow-'], 'H3');
    const underBoldSans = renderHeadingClasses(
      <Preset overrides={{ headingFont: 'sans-serif', fontWeight: 'bold' }}>
        <H3>{TITLE}</H3>
      </Preset>,
      ['_fow-'],
      'H3',
    );
    expect(byDefault).not.toHaveLength(0);
    expect(byDefault).toEqual(underBoldSans);
  });
});
