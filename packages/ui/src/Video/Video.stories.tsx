import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Video } from './index';

const meta: Meta<typeof Video> = {
  title: 'Components/Video',
  component: Video,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'General video surface. Web uses `<video>` with house overlay chrome (play, seek, mute, fullscreen); native uses optional peer `expo-video` system controls. Defaults favor controls-on, autoplay-off for desk use.',
      },
    },
  },
  argTypes: {
    src: { control: 'text' },
    controls: { control: 'boolean' },
    muted: { control: 'boolean' },
    autoPlay: { control: 'boolean' },
    loop: { control: 'boolean' },
    poster: { control: 'text' },
    compact: { control: 'boolean' },
    title: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Video>;

/** Short public-domain sample (W3C / MDN). */
const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export const Default: Story = {
  name: 'Main',
  args: {
    src: SAMPLE,
    controls: true,
    title: 'Flower',
    children: 'MDN CC0 sample clip.',
  },
};

export const MutedLoop: Story = {
  args: {
    src: SAMPLE,
    muted: true,
    loop: true,
    autoPlay: true,
    controls: true,
    children: 'Autoplay muted loop (web + native when expo-video is installed).',
  },
};

export const WithPoster: Story = {
  render: () => (
    <YStack maxWidth={560}>
      <Video
        src={SAMPLE}
        poster="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.jpg"
        title="Flower with poster">
        Poster frame before play (HTML poster on web; image overlay until first frame on native).
      </Video>
    </YStack>
  ),
};

/** Smoke: empty src still renders a figure shell (no player). */
export const EmptySrc: Story = {
  args: {
    src: '',
    children: 'No media — figure shell only.',
  },
};
