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
import { Preset, type BorderRadius } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as errorSummaryStories from './ErrorSummary.stories';
import * as fieldGroupStories from './FieldGroup.stories';
import * as fieldLayoutStories from './FieldLayout.stories';
import * as fieldsetStories from './Fieldset.stories';
import * as formGridStories from './FormGrid.stories';
import * as labelStories from './Label/Label.stories';

afterEach(cleanup);

/** Knob stop -> the radius atom the frame paints: a token `$N`, or px at `medium`. */
const ladder: Record<BorderRadius, string> = {
  none: '$0',
  small: '$2',
  medium: '9px',
  large: '$6',
  full: '$12',
};
const stops = Object.keys(ladder) as BorderRadius[];

interface StoryLike {
  render?: (args: Record<string, unknown>) => ReactElement;
}

function radiusAtom(cls: string): string | undefined {
  const token = /^_btlr-t-radius-(\d+)$/.exec(cls);
  if (token) {
    return `$${token[1]}`;
  }
  return /^_btlr-(\d+px)$/.exec(cls)?.[1];
}

/** Every radius token present in the subtree, deduped — the probe's reading. */
function radiusTokens(container: HTMLElement): string[] {
  const found = new Set<string>();
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    for (const cls of String(el.className || '').split(/\s+/)) {
      const radius = radiusAtom(cls);
      if (radius) {
        found.add(radius);
      }
    }
  }
  return [...found].sort();
}

function mountAt(story: StoryLike, meta: { args?: unknown }, stop: BorderRadius) {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(
    <Preset overrides={{ borderRadius: stop, elevation: 'none' }}>
      {story.render({ ...((meta.args ?? {}) as Record<string, unknown>) })}
    </Preset>,
  );
}

const family = [
  {
    name: 'Forms/FieldLayout',
    story: fieldLayoutStories.Basic as StoryLike,
    meta: fieldLayoutStories.default,
  },
  {
    name: 'Forms/FieldGroup',
    story: fieldGroupStories.Basic as StoryLike,
    meta: fieldGroupStories.default,
  },
  {
    name: 'Forms/Fieldset',
    story: fieldsetStories.Default as StoryLike,
    meta: fieldsetStories.default,
  },
  {
    name: 'Forms/FormGrid',
    story: formGridStories.Basic as StoryLike,
    meta: formGridStories.default,
  },
];

describe('form layout stories mount knob-consuming field chrome', () => {
  for (const { name, story, meta } of family) {
    describe(name, () => {
      // A story that fails to render measures flat on every axis, which reads
      // exactly like a dead knob. Prove there is a control before believing
      // anything measured off it.
      it('renders a text control at all', () => {
        const { container } = mountAt(story, meta as { args?: unknown }, 'medium');
        expect(container.querySelectorAll('input').length).toBeGreaterThan(0);
      });

      for (const stop of stops) {
        it(`takes radius ${ladder[stop]} at borderRadius:${stop}`, () => {
          const { container } = mountAt(story, meta as { args?: unknown }, stop);
          expect(radiusTokens(container)).toContain(ladder[stop]);
        });
      }

      it('moves across all five stops instead of pinning one radius', () => {
        const signatures = stops.map((stop) => {
          const result = mountAt(story, meta as { args?: unknown }, stop);
          const tokens = JSON.stringify(radiusTokens(result.container));
          cleanup();
          return tokens;
        });
        expect(new Set(signatures).size).toBe(stops.length);
      });
    });
  }
});

/**
 * ErrorSummary and Label mount a text control beside the part under test, so
 * the probe measures that control's chrome. The Box around each input has to
 * carry the knob's token: a raw tamagui Input pins its own radius and no
 * ancestor moves.
 */
function inputChromeTokens(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('input')].map((input) => {
    for (let el = input.parentElement; el && el !== container; el = el.parentElement) {
      for (const cls of String(el.className || '').split(/\s+/)) {
        const radius = radiusAtom(cls);
        if (radius) {
          return radius;
        }
      }
    }
    return 'none found';
  });
}

const beside = [
  {
    name: 'Forms/ErrorSummary FocusesTheFieldOnPress',
    story: errorSummaryStories.FocusesTheFieldOnPress as StoryLike,
    meta: errorSummaryStories.default,
    inputs: 2,
  },
  {
    name: 'Forms/Label WithControl',
    story: labelStories.WithControl as StoryLike,
    meta: labelStories.default,
    inputs: 1,
  },
];

describe('stories that mount a text control beside a form part use house chrome', () => {
  for (const { name, story, meta, inputs } of beside) {
    describe(name, () => {
      for (const stop of stops) {
        it(`wraps every input in chrome at radius ${ladder[stop]} at borderRadius:${stop}`, () => {
          const { container } = mountAt(story, meta as { args?: unknown }, stop);
          expect(inputChromeTokens(container)).toEqual(Array(inputs).fill(ladder[stop]));
        });
      }
    });
  }
});
