import { defaultKnobs } from '../knobs';

import { ColorLineVisualizer } from './ColorLineVisualizer';

const SAMPLE = Array.from({ length: 12 }, (_, i) => `hsl(${i * 28}, 62%, ${72 - i * 3.5}%)`);

export default {
  title: 'Theme/ColorLineVisualizer',
  component: ColorLineVisualizer,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Twelve-step theme ramp with semantic group brackets. Tamagui has no equivalent; this is the mpo knob-devtools colour line.',
      },
    },
  },
};

export const main = {
  name: 'Main',
  render: () => (
    <div data-testid="color-line-visualizer">
      <ColorLineVisualizer knobs={defaultKnobs} isDark={false} themeColors={SAMPLE} />
    </div>
  ),
};

export const dark = {
  name: 'Dark',
  render: () => (
    <div data-testid="color-line-visualizer-dark">
      <ColorLineVisualizer knobs={defaultKnobs} isDark themeColors={SAMPLE} />
    </div>
  ),
};
