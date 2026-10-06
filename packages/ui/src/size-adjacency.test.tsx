/**
 * The adjacency check. A Button,
 * an Input, a Select trigger and a ListItem in one `XStack` at the same size
 * token, with only a `gap`, must agree on height and on radius. They differ
 * only in interior padding. `constraintAudit` checks that each
 * value lands on a token step; nothing checked that siblings agree.
 *
 * The DOM here cannot lay out and does not resolve Tamagui's CSS variables,
 * so each frame's box is read from the atoms it paints (`_h-44px`,
 * `_btlr-t-radius-4`, `_mih-t-size-4`) and resolved through the live token
 * table. That is the same box a browser computes for these frames: none of
 * them grows past its height or min-height with one line of content.
 *
 * The law holds for height and for the controls' radius at every size stop,
 * whether the token arrives through the size knob or a `size` prop. At the
 * `medium` radius stop the controls paint the size table's corner. ListItem
 * joins the height check
 * only: it is a flush row (SP-EDGE, radius 0) and never takes the controls'
 * radius.
 */

import { Input, Select } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Size } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { getTokens } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './Button';
import { ListItem, XStack } from './tamagui';

afterEach(cleanup);

interface Box {
  height: number;
  radius: number;
}
type Row = Record<'Button' | 'Input' | 'Select trigger' | 'ListItem', Box>;

const stops = [
  ['small', '$3'],
  ['medium', '$4'],
  ['large', '$5'],
] as const satisfies readonly (readonly [Size, string])[];

const atom = (el: HTMLElement, prop: string) => {
  for (const cls of String(el.className || '').split(/\s+/)) {
    if (!cls.startsWith(`_${prop}-`)) {
      continue;
    }
    const value = cls.slice(prop.length + 2);
    if (/^-?\d+(?:\.\d+)?px$|^t-(?:size|radius)-\d+$/.test(value)) {
      return value;
    }
  }
  return undefined;
};

const px = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const literal = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (literal) {
    return Number(literal[1]);
  }
  const [, scale, step] = /^t-(size|radius)-(\d+)$/.exec(value) ?? [];
  const tokens = getTokens() as unknown as Record<string, Record<string, { val: unknown }>>;
  return Number.parseFloat(String(tokens[scale ?? '']?.[`$${step}`]?.val));
};

const box = (el: HTMLElement | null, name: string): Box => {
  if (!el) {
    throw new Error(`${name} frame not rendered`);
  }
  const height = px(atom(el, 'h') ?? atom(el, 'mih'));
  if (height === undefined) {
    throw new Error(`${name} paints no height`);
  }
  return { height, radius: px(atom(el, 'btlr')) ?? 0 };
};

const measure = (ui: ReactElement): Row => {
  const { container } = renderWithProviders(ui);
  const frame = (selector: string) => container.querySelector<HTMLElement>(selector);
  return {
    Button: box(frame('[data-mp-button-height]'), 'Button'),
    Input: box(frame('[data-mp-input-box]'), 'Input'),
    'Select trigger': box(frame('[data-testid="select-trigger"]'), 'Select trigger'),
    ListItem: box(frame('[data-testid="l1-list-item"]'), 'ListItem'),
  };
};

/** The mpo size channel: the size knob, which every house control reads. */
const atKnob = (knob: Size, token: string) =>
  measure(
    <Preset overrides={{ size: knob }}>
      <XStack gap="$2">
        <Button>Save</Button>
        <Input placeholder="Name" />
        <Select
          options={[{ value: 'a', label: 'A' }]}
          placeholder="Pick"
        />
        <ListItem
          size={token as '$4'}
          title="Row"
          data-testid="l1-list-item"
        />
      </XStack>
    </Preset>,
  );

/** The same token handed to each component directly. */
const atSizeProp = (token: '$3' | '$4' | '$5') =>
  measure(
    <XStack gap="$2">
      <Button size={token}>Save</Button>
      <Input
        size={token}
        placeholder="Name"
      />
      <Select
        size={token}
        options={[{ value: 'a', label: 'A' }]}
        placeholder="Pick"
      />
      <ListItem
        size={token}
        title="Row"
        data-testid="l1-list-item"
      />
    </XStack>,
  );

const heights = (row: Row) => Object.fromEntries(Object.entries(row).map(([name, b]) => [name, b.height]));

const radii = (row: Row, names: (keyof Row)[]) => Object.fromEntries(names.map((name) => [name, row[name].radius]));

const agreed = (values: Record<string, number>) => {
  const first = Object.values(values)[0];
  return Object.fromEntries(Object.keys(values).map((name) => [name, first]));
};

const controls: (keyof Row)[] = ['Button', 'Input', 'Select trigger'];

describe('adjacency: Button, Input, Select trigger and ListItem at one size token', () => {
  for (const [knob, token] of stops) {
    it(`all four paint one height at size ${knob} (${token})`, () => {
      const row = heights(atKnob(knob, token));
      expect(row).toStrictEqual(agreed(row));
    });
  }

  it('catches a deliberate violation: a Button ejected to its own height', () => {
    const row = heights(
      measure(
        <XStack gap="$2">
          <Button
            height={30}
            sizeRecipeEscape="L1 adjacency fixture">
            Save
          </Button>
          <Input placeholder="Name" />
          <Select
            options={[{ value: 'a', label: 'A' }]}
            placeholder="Pick"
          />
          <ListItem
            size="$4"
            title="Row"
            data-testid="l1-list-item"
          />
        </XStack>,
      ),
    );
    expect(row.Button).toBe(30);
    expect(row).not.toStrictEqual(agreed(row));
  });

  const sizeTableRadius = { $3: 7, $4: 9, $5: 10 } as const;

  for (const [knob, token] of stops) {
    it(`Button, Input and Select trigger paint one radius at size ${knob} (${token})`, () => {
      const row = radii(atKnob(knob, token), controls);
      expect(row).toStrictEqual(agreed(row));
      expect(row.Button).toBe(sizeTableRadius[token]);
    });
  }

  it("ListItem stays a flush row beside them: radius 0, never the controls' radius", () => {
    const row = radii(atKnob('medium', '$4'), [...controls, 'ListItem']);
    expect(row.ListItem).toBe(0);
    expect(row.Button).toBeGreaterThan(0);
  });

  it("any other radius stop is the knob's, whatever the size", () => {
    const row = radii(
      measure(
        <Preset overrides={{ size: 'small', borderRadius: 'large' }}>
          <XStack gap="$2">
            <Button>Save</Button>
            <Input placeholder="Name" />
            <Select
              options={[{ value: 'a', label: 'A' }]}
              placeholder="Pick"
            />
            <ListItem
              size="$3"
              title="Row"
              data-testid="l1-list-item"
            />
          </XStack>
        </Preset>,
      ),
      controls,
    );
    expect(row).toStrictEqual({ Button: 16, Input: 16, 'Select trigger': 16 });
  });

  for (const token of ['$3', '$4', '$5'] as const) {
    it(`an explicit size=${token} moves all four heights and the controls' radius together`, () => {
      const row = atSizeProp(token);
      expect(heights(row)).toStrictEqual(agreed(heights(row)));
      expect(radii(row, controls)).toStrictEqual(agreed(radii(row, controls)));
      expect(row.Button.radius).toBe(sizeTableRadius[token]);
    });
  }
});
