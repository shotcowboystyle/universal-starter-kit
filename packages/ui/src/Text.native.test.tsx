import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
/**
 * House Text knob wiring, NATIVE arm. Sibling of
 * ./Heading.native.test.tsx — see its header for WHY the arm is a separate
 * file (the `vi.resetModules()` version returned a split module graph and
 * proved nothing) and for what a `.native` spec can and cannot claim.
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Paragraph, SizableText, Text } from './Text';

vi.mock('@repo/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  isWeb: false,
  isNative: true,
}));

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

describe('house Text — NATIVE environment (isWeb false)', () => {
  it('really is running with the native platform flags', async () => {
    const platform = await import('@repo/platform');
    expect(platform.isWeb).toBe(false);
    expect(platform.isNative).toBe(true);
  });

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
    expect(high).not.toEqual(low);
  });

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
    const explicit400 = renderTextClasses(<Text fontWeight="400">{LABEL}</Text>, ['_fow-']);
    const explicit700 = renderTextClasses(<Text fontWeight="700">{LABEL}</Text>, ['_fow-']);
    expect(regular).not.toHaveLength(0);
    expect(regular).not.toEqual(bold);
    expect(regular).toEqual(explicit400);
    expect(bold).toEqual(explicit700);
  });

  it('changes family on a bodyFont flip — the props channel, not the CSS rescue', () => {
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
    expect(sans).not.toBe('');
    expect(sans).not.toBe(mono);
    expect(mono).toBe('font_mono');
  });

  it('carries the same knobs on the sibling body voices', () => {
    for (const Voice of [SizableText, Paragraph]) {
      const high = renderTextClasses(
        <Preset overrides={{ textAccent: 'high' }}>
          <Voice>{LABEL}</Voice>
        </Preset>,
        ['_col-'],
      );
      const low = renderTextClasses(
        <Preset overrides={{ textAccent: 'low' }}>
          <Voice>{LABEL}</Voice>
        </Preset>,
        ['_col-'],
      );
      expect(high).not.toHaveLength(0);
      expect(high).not.toEqual(low);
    }
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
