import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { MarkdownImage } from '../components/Image';
import { MDXTabs, MDXTab } from '../Tabs';
import { Video } from '../Video';

const meta: Meta = {
  title: 'Markdown/Media',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Markdown media renderers: MarkdownImage, Video, MDXTabs/MDXTab.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// 1x1 blue png data uri — no network dependency
const bluePixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const ImageStory: Story = {
  name: 'MarkdownImage',
  args: { src: bluePixel, alt: 'blue pixel' },
  argTypes: {
    src: { control: 'text' },
    alt: { control: 'text' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MarkdownImage
        src={args.src}
        alt={args.alt}
      />
    </YStack>
  ),
};

export const ImageEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>Broken src:</Paragraph>
      <MarkdownImage
        src="https://invalid.invalid/broken.png"
        alt="broken image"
      />
      <Paragraph>Missing src:</Paragraph>
      <MarkdownImage
        src=""
        alt=""
        title="title only"
      />
    </YStack>
  ),
};

export const VideoStory: Story = {
  name: 'Video',
  args: {
    src: '',
    muted: true,
    autoPlay: false,
    controls: true,
    loop: false,
  },
  argTypes: {
    src: { control: 'text' },
    muted: { control: 'boolean' },
    autoPlay: { control: 'boolean' },
    controls: { control: 'boolean' },
    loop: { control: 'boolean' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Video
        src={args.src}
        muted={args.muted}
        autoPlay={args.autoPlay}
        controls={args.controls}
        loop={args.loop}>
        A caption for the video figure.
      </Video>
    </YStack>
  ),
};

export const VideoEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>Invalid source, no caption:</Paragraph>
      <Video src="https://invalid.invalid/broken.mp4" />
      <Paragraph>Empty source with caption:</Paragraph>
      <Video src="">caption under an empty-source video</Video>
    </YStack>
  ),
};

export const TabsStory: Story = {
  name: 'MDXTabs',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXTabs
        items={['npm', 'pnpm', 'yarn']}
        defaultValue="pnpm">
        <MDXTab>
          <Paragraph>npm install package</Paragraph>
        </MDXTab>
        <MDXTab>
          <Paragraph>pnpm add package</Paragraph>
        </MDXTab>
        <MDXTab>
          <Paragraph>yarn add package</Paragraph>
        </MDXTab>
      </MDXTabs>
    </YStack>
  ),
};

export const TabsEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>Single tab:</Paragraph>
      <MDXTabs items={['only']}>
        {[
          <MDXTab key="only">
            <Paragraph>single panel</Paragraph>
          </MDXTab>,
        ]}
      </MDXTabs>
      <Paragraph>More tabs than panels (missing matching panel):</Paragraph>
      <MDXTabs items={['one', 'two', 'three']}>
        {[
          <MDXTab key="one">
            <Paragraph>panel one only</Paragraph>
          </MDXTab>,
        ]}
      </MDXTabs>
      <Paragraph>Long + duplicate labels:</Paragraph>
      <MDXTabs items={['a very long tab label that should overflow the tab list at narrow widths', 'dup']}>
        {[
          <MDXTab key="long">
            <Paragraph>long label panel</Paragraph>
          </MDXTab>,
          <MDXTab key="dup">
            <Paragraph>dup panel</Paragraph>
          </MDXTab>,
        ]}
      </MDXTabs>
      <Paragraph>Empty items:</Paragraph>
      <MDXTabs items={[]}>{[]}</MDXTabs>
    </YStack>
  ),
};
