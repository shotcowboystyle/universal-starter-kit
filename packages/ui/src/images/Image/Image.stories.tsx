import { resolveChartPalette } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View, XStack, YStack } from 'tamagui';

import { Image } from './index';

/**
 * Self-contained plate (no network): a horizon + sun on a categorical solid.
 * Embedded SVG pixels, not UI chrome — same honesty rule as ImageGrid.
 */
function plateSrc(color: string, seed: number, w = 400, h = 400): string {
  const sunX = Math.round(w * 0.62) + (seed % 5) * 12;
  const sunY = Math.round(h * 0.18) + (seed % 4) * 10;
  const sunR = 28 + (seed % 3) * 6;
  const horizon = Math.round(h * 0.55) + (seed % 5) * 10;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${color}"/>
      <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="white" fill-opacity="0.28"/>
      <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="black" fill-opacity="0.2"/>
    </svg>`,
  )}`;
}

const palette = resolveChartPalette({ scheme: 'light' }).categorical;
const LANDSCAPE_IMG = plateSrc(palette[0] ?? '#3b6ea8', 0, 800, 400);
const SQUARE_IMG = plateSrc(palette[1] ?? '#6b4ea8', 1, 400, 400);
const SVG_IMG = plateSrc(palette[2] ?? '#2a9d8f', 2, 200, 200);
const GIF_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const meta: Meta<typeof Image> = {
  title: 'Components/Image',
  component: Image,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Catalog Image is a media-19 tile: unclamped `borderRadius`, no status pip on the media (R11 / DL-1). Loading and error replace the tile wholesale. Nested hue is opt-in — Image does not wrap Tint (R12).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Image>;

export const BothDimensions: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Landscape with both dimensions',
    width: 400,
    height: 200,
  },
};

export const WidthOnly: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Landscape with width only',
    width: 400,
  },
};

export const HeightOnly: Story = {
  args: {
    src: SQUARE_IMG,
    alt: 'Square with height only',
    height: 200,
  },
};

export const WidthWithAspectRatio: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Landscape with width and aspect ratio',
    width: 400,
    aspectRatio: 16 / 9,
  },
};

export const FullWidthResponsive: Story = {
  render: () => (
    <View width="100%" maxWidth={600}>
      <Image src={LANDSCAPE_IMG} alt="Full width responsive" width="100%" aspectRatio={2} />
    </View>
  ),
};

export const ObjectFitCover: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Cover fit',
    width: 300,
    height: 300,
    objectFit: 'cover',
  },
};

export const ObjectFitContain: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Contain fit',
    width: 300,
    height: 300,
    objectFit: 'contain',
  },
};

export const SvgImage: Story = {
  args: {
    src: SVG_IMG,
    alt: 'SVG plate',
    width: 200,
    height: 200,
  },
};

export const GifImage: Story = {
  args: {
    src: GIF_IMG,
    alt: 'GIF pixel',
    width: 200,
    height: 200,
  },
};

export const NoDimensions: Story = {
  args: {
    src: SQUARE_IMG,
    alt: 'No explicit dimensions',
  },
};

export const WithBorderRadius: Story = {
  args: {
    src: LANDSCAPE_IMG,
    alt: 'Rounded image',
    width: 300,
    height: 200,
    borderRadius: 16,
  },
};

export const Thumbnails: Story = {
  render: () => (
    <XStack gap="$3" alignItems="flex-end" padding="$4">
      <Image src={SQUARE_IMG} alt="Extra small nested" size="extraSmall" compact />
      <Image src={SQUARE_IMG} alt="Small" size="small" />
      <Image src={SQUARE_IMG} alt="Medium" size="medium" />
      <Image src={SQUARE_IMG} alt="Large" size="large" />
    </XStack>
  ),
};

export const FillParent: Story = {
  render: () => (
    <View width={280} height={160} position="relative" overflow="hidden" borderRadius="$4">
      <Image src={LANDSCAPE_IMG} alt="Fill parent" fill sizes="280px" />
    </View>
  ),
};

export const MissingFallback: Story = {
  args: {
    alt: 'Unavailable photo',
    size: 'medium',
  },
};

export const StackedGroup: Story = {
  render: () => (
    <XStack>
      <Image src={SQUARE_IMG} alt="First" size="medium" groupPosition="first" groupOrientation="horizontal" />
      <Image src={SQUARE_IMG} alt="Middle" size="medium" groupPosition="middle" groupOrientation="horizontal" />
      <Image src={SQUARE_IMG} alt="Last" size="medium" groupPosition="last" groupOrientation="horizontal" />
    </XStack>
  ),
};

export const Pressable: Story = {
  args: {
    src: SQUARE_IMG,
    alt: 'Open photo',
    size: 'medium',
    onPress: () => {},
  },
};

export const Gallery: Story = {
  render: () => (
    <YStack gap="$4" padding="$4" maxWidth={800}>
      <Image src={LANDSCAPE_IMG} alt="Both dimensions" width={400} height={200} testID="gallery-both" />
      <XStack gap="$3" alignItems="flex-end">
        <Image src={SQUARE_IMG} alt="Extra small" size="extraSmall" compact testID="gallery-xs" />
        <Image src={SQUARE_IMG} alt="Small" size="small" testID="gallery-sm" />
        <Image src={SQUARE_IMG} alt="Medium" size="medium" testID="gallery-md" />
        <Image src={SQUARE_IMG} alt="Large" size="large" testID="gallery-lg" />
      </XStack>
      <XStack>
        <Image
          src={SQUARE_IMG}
          alt="Stack first"
          size="medium"
          groupPosition="first"
          groupOrientation="horizontal"
          testID="gallery-stack-first"
        />
        <Image src={SQUARE_IMG} alt="Stack middle" size="medium" groupPosition="middle" groupOrientation="horizontal" />
        <Image src={SQUARE_IMG} alt="Stack last" size="medium" groupPosition="last" groupOrientation="horizontal" />
      </XStack>
      <XStack gap="$3">
        <Image
          src={LANDSCAPE_IMG}
          alt="Cover"
          width={160}
          height={160}
          objectFit="cover"
          framed
          testID="gallery-cover"
        />
        <Image alt="Unavailable" size="medium" testID="gallery-fallback" />
        <Image src={SQUARE_IMG} alt="Open photo" size="medium" onPress={() => {}} testID="gallery-press" />
      </XStack>
      <Image src={SVG_IMG} alt="SVG" width={100} height={100} testID="gallery-svg" />
      <Image src={GIF_IMG} alt="GIF" width={150} height={150} testID="gallery-gif" />
    </YStack>
  ),
};
