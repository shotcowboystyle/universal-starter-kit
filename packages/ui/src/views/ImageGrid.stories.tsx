import { action } from '@repo/storybook';
import { resolveChartPalette } from '@repo/theme';
import type { Meta } from '@storybook/react-native-web-vite';
import { Text, YStack } from 'tamagui';

import { Image } from '../images/Image';

import { ImageGrid } from './ImageGrid';

interface ImageItem {
  id: string;
  src: string;
  alt: string;
  title: string;
  filename: string;
}

const TITLES = [
  'Harbor morning',
  'Cedar ridge',
  'Studio north',
  'Meadow late',
  'Night folio',
  'Grain loft',
  'Atlas quay',
  'Copper dune',
  'Glass marsh',
  'Ember hall',
  'North jetty',
  'Vellum field',
] as const;

/**
 * Self-contained plate (no network): a horizon + sun on a categorical solid.
 * Embedded SVG pixels, not UI chrome — same honesty rule as ImageView sprites.
 */
function plateSrc(color: string, seed: number): string {
  const sunX = 248 + (seed % 5) * 22;
  const sunY = 58 + (seed % 4) * 16;
  const sunR = 34 + (seed % 3) * 8;
  const horizon = 214 + (seed % 5) * 16;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" fill="${color}"/>
      <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="white" fill-opacity="0.28"/>
      <rect y="${horizon}" width="400" height="${400 - horizon}" fill="black" fill-opacity="0.2"/>
    </svg>`,
  )}`;
}

const palette = resolveChartPalette({ scheme: 'light' }).categorical;

const items: ImageItem[] = TITLES.map((title, i) => ({
  id: `img-${i + 1}`,
  src: plateSrc(palette[i % palette.length] ?? palette[0], i),
  alt: title,
  title,
  filename: `IMG_${1042 + i * 7}.jpg`,
}));

const meta: Meta = {
  title: 'Components/ImageGrid',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Live-media tiles: unclamped `borderRadius` (media-19, not CONTAINER-CAP). No status pip on the photograph (R11 / DL-1). Nested hue is opt-in — ImageGrid does not wrap Tint (R12).',
      },
    },
  },
};

export default meta;

function PhotoPlate({ item }: { item: ImageItem }) {
  // Catalog Image. No tile-owned radius (story honesty):
  // ImageGrid's card frame clips items at the knob radius — a pinned $3
  // held a 7px arc at borderRadius:none.
  return <Image src={item.src} alt={item.alt} width="100%" aspectRatio={1} objectFit="cover" borderRadius={0} />;
}

export const Default = {
  name: 'Main',
  render: () => (
    <ImageGrid<ImageItem>
      items={items}
      columns={3}
      onItemClick={action('onItemClick')}
      renderItem={(item) => <PhotoPlate item={item} />}
      height={400}
    />
  ),
};

/**
 * Polar MediaCard anatomy: square media, title + muted filename under the
 * plate. The grid rings the whole card (image + caption), not the photo
 * alone — the perceived control is the card.
 */
export const WithCaptions = {
  render: () => (
    <ImageGrid<ImageItem>
      items={items.slice(0, 6)}
      columns={3}
      onItemClick={action('onItemClick')}
      renderItem={(item) => (
        <YStack>
          <PhotoPlate item={item} />
          <YStack padding="$2" gap="$1">
            <Text fontSize="$3" color="$color12" numberOfLines={1}>
              {item.title}
            </Text>
            <Text fontSize="$2" color="$color11" numberOfLines={1}>
              {item.filename}
            </Text>
          </YStack>
        </YStack>
      )}
      height={480}
    />
  ),
};

/**
 * Initial load with no items renders the grid-shaped skeleton twin — muted
 * aspect-correct blocks in the live cell geometry, not a raw spinner.
 */
export const Loading = {
  render: () => <ImageGrid<ImageItem> items={[]} columns={3} renderItem={() => null} isLoading />,
};

/** No images, no failure — neutral empty state (Axiom 6: empty ≠ error). */
export const Empty = {
  render: () => (
    <ImageGrid<ImageItem>
      items={[]}
      columns={3}
      renderItem={() => null}
      emptyMessage="No images uploaded"
      height={400}
    />
  ),
};

/**
 * Images exist upstream but the active filter matches nothing — no-results ≠
 * empty (Axiom 6 HONEST STATE). The consumer names the filter in
 * `emptyMessage`.
 */
export const NoResults = {
  render: () => (
    <ImageGrid<ImageItem>
      items={[]}
      columns={3}
      renderItem={() => null}
      emptyMessage='No images match "screenshots"'
      height={400}
    />
  ),
};

/** Failed load wins over empty — error chrome with retry, never empty chrome. */
export const Error = {
  render: () => (
    <ImageGrid<ImageItem>
      items={[]}
      columns={3}
      renderItem={() => null}
      error="The image list could not be loaded."
      onRetry={action('onRetry')}
    />
  ),
};
