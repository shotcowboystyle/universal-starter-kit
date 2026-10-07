/**
 * The four form LAYOUT stories must mount house field chrome, not a raw
 * tamagui primitive.
 *
 * FieldLayout, FieldGroup, Fieldset and FormGrid paint no radius of their own —
 * they are stacks, a grid and a legend. Whatever radius a probe reads off one
 * of their stories belongs to the CONTROL the story chose to mount. A raw
 * `Input` from "tamagui" consumes no knobs, so it pins one radius at every
 * stop and the axis reads dead against a component that never had a say.
 *
 * The measurement here is therefore the STORY's, not the component's: walk the
 * borderRadius knob and assert the control inside each story tracks it.
 *
 * Under jsdom the providers inject no CSS and the radius atom keeps its token
 * reference (`_btlr-t-radius-6`) rather than resolving to `16px`, so this file
 * gates the token ladder. At `medium` the Box paints the size table's corner
 * as a number (`_btlr-9px` at the default `$4`), so that stop
 * reads the px atom. The pixel ladder (0/5/9/16/50) and the dark scheme are
 * measured for real by scripts/knob-axis-probe.mjs against a browser.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { BorderRadius } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import errorSummaryMeta, { FocusesTheFieldOnPress } from './ErrorSummary.stories';
import fieldGroupMeta, { Basic as FieldGroupBasic } from './FieldGroup.stories';
import fieldLayoutMeta, { Basic as FieldLayoutBasic } from './FieldLayout.stories';
import fieldsetMeta, { Default as FieldsetDefault } from './Fieldset.stories';
import formGridMeta, { Basic as FormGridBasic } from './FormGrid.stories';
import labelMeta, { WithControl } from './Label/Label.stories';

/** Knob stop -> the radius atom the frame paints: a token `$N`, or px at `medium`. */
const ladder: Record<BorderRadius, string> = {
  none: '$0',
  small: '$2',
  medium: '9px',
  large: '$6',
  full: '$12',
};
const stops = Object.keys(ladder) as BorderRadius[];
const stopCases = stops.map((stop) => ({ stop, atom: ladder[stop] }));

interface StoryLike {
  // oxlint-disable-next-line anti-slop/no-object-parameters -- one seam for stories of different components; args are always the story meta's own args
  render?: (args: object) => ReactElement;
}

const radiusAtom = (cls: string): string | undefined => {
  const token = /^_btlr-t-radius-(?<step>\d+)$/u.exec(cls);
  if (token?.groups !== undefined) {
    return `$${token.groups.step}`;
  }
  return /^_btlr-(?<px>\d+px)$/u.exec(cls)?.groups?.px;
};

const classesOf = (el: HTMLElement): string[] => (el.getAttribute('class') ?? '').split(/\s+/u);

/** Every radius token present in the subtree, deduped — the probe's reading. */
const radiusTokens = (container: HTMLElement): string[] => {
  const found = new Set<string>();
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    for (const cls of classesOf(el)) {
      const radius = radiusAtom(cls);
      if (radius !== undefined) {
        found.add(radius);
      }
    }
  }
  return [...found].toSorted();
};

const mountAt = (story: StoryLike, meta: { args?: object }, stop: BorderRadius) => {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(
    <Preset overrides={{ borderRadius: stop, elevation: 'none' }}>{story.render({ ...meta.args })}</Preset>,
  );
};

const family = [
  {
    name: 'Forms/FieldLayout',
    story: FieldLayoutBasic as StoryLike,
    meta: fieldLayoutMeta,
  },
  {
    name: 'Forms/FieldGroup',
    story: FieldGroupBasic as StoryLike,
    meta: fieldGroupMeta,
  },
  {
    name: 'Forms/Fieldset',
    story: FieldsetDefault as StoryLike,
    meta: fieldsetMeta,
  },
  {
    name: 'Forms/FormGrid',
    story: FormGridBasic as StoryLike,
    meta: formGridMeta,
  },
];

describe('form layout stories mount knob-consuming field chrome', () => {
  afterEach(cleanup);

  describe.each(family)('$name', ({ story, meta }) => {
    // A story that fails to render measures flat on every axis, which reads
    // exactly like a dead knob. Prove there is a control before believing
    // anything measured off it.
    it('renders a text control at all', () => {
      const { container } = mountAt(story, meta, 'medium');
      expect(container.querySelectorAll('input').length).toBeGreaterThan(0);
    });

    it.each(stopCases)('takes radius $atom at borderRadius:$stop', ({ stop, atom }) => {
      const { container } = mountAt(story, meta, stop);
      expect(radiusTokens(container)).toContain(atom);
    });

    it('moves across all five stops instead of pinning one radius', () => {
      const signatures = stops.map((stop) => {
        const result = mountAt(story, meta, stop);
        const tokens = JSON.stringify(radiusTokens(result.container));
        cleanup();
        return tokens;
      });
      expect(new Set(signatures).size).toBe(stops.length);
    });
  });
});

/**
 * ErrorSummary and Label mount a text control beside the part under test, so
 * the probe measures that control's chrome. The Box around each input has to
 * carry the knob's token: a raw tamagui Input pins its own radius and no
 * ancestor moves.
 */
const inputChromeTokens = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('input')].map((input) => {
    for (let el = input.parentElement; el && el !== container; el = el.parentElement) {
      for (const cls of classesOf(el)) {
        const radius = radiusAtom(cls);
        if (radius !== undefined) {
          return radius;
        }
      }
    }
    return 'none found';
  });

const beside = [
  {
    name: 'Forms/ErrorSummary FocusesTheFieldOnPress',
    story: FocusesTheFieldOnPress as StoryLike,
    meta: errorSummaryMeta,
    inputs: 2,
  },
  {
    name: 'Forms/Label WithControl',
    story: WithControl as StoryLike,
    meta: labelMeta,
    inputs: 1,
  },
];

describe('stories that mount a text control beside a form part use house chrome', () => {
  afterEach(cleanup);

  describe.each(beside)('$name', ({ story, meta, inputs }) => {
    it.each(stopCases)('wraps every input in chrome at radius $atom at borderRadius:$stop', ({ stop, atom }) => {
      const { container } = mountAt(story, meta, stop);
      expect(inputChromeTokens(container)).toStrictEqual(Array.from({ length: inputs }, () => atom));
    });
  });
});
