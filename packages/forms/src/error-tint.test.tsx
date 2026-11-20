/**
 * A field in its error state enters the semantic `error` theme, so
 * the tint survives an app that ships the default theme subset. The stock
 * test config has no `error` theme, so both house configs are mounted here.
 */

import {
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  subsetThemes,
} from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Duration } from './fields/Duration';
import { Input } from './fields/Input';
import { TextArea } from './fields/TextArea';

const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const defaultSubset = {
  components: ['Button', 'Input', 'TextArea'],
  tints: ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'],
};

const configs = {
  full: createTamagui({
    ...configWithoutAnimations,
    animations: animationsCSS,
    themes: houseThemes as any,
  }),
  subset: createTamagui({
    ...configWithoutAnimations,
    animations: animationsCSS,
    themes: subsetThemes(houseThemes, defaultSubset) as any,
  }),
};

const fields = {
  Input: (
    <Input
      label="Email"
      name="email"
      error="Enter an email address"
    />
  ),
  TextArea: (
    <TextArea
      label="Notes"
      name="notes"
      error="Enter a note"
    />
  ),
  Duration: (
    <Duration
      label="Length"
      name="length"
      value={60}
      error="Enter a length"
    />
  ),
} satisfies Record<string, ReactElement>;

const cases = Object.entries(configs).flatMap(([configName, config]) =>
  (['light', 'dark'] as const).flatMap((scheme) =>
    Object.entries(fields).map(([fieldName, field]) => ({ configName, config, scheme, fieldName, field })),
  ),
);

describe('field error tint', () => {
  it.each(cases)(
    '$fieldName enters the error theme under the $configName config ($scheme)',
    ({ config, scheme, field }) => {
      const { container } = render(
        <TamaguiProvider
          config={config}
          defaultTheme={scheme}
          disableInjectCSS>
          {field}
        </TamaguiProvider>,
      );
      expect(container.querySelector('.t_error')).not.toBeNull();
      expect(container.querySelector("[class*='t_red']")).toBeNull();
    },
  );
});
