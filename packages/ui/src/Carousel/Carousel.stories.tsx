import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, View, YStack } from 'tamagui';

import { Image } from '../images/Image';
import { Card } from '../surfaces';

import { Carousel } from './index';

const meta: Meta<typeof Carousel> = {
  title: 'Components/Carousel',
  component: Carousel,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Horizontal paging strip (LC-62): slides size from the measured viewport, never percent-of-track. Arrows ride size-recipe fragments + R-BINARY radius and A-STATE fill. Does not wrap Tint (R12) — nested hue is opt-in.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Carousel>;

const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

const SlideContent = ({ index, color, height = 200 }: { index: number; color: string; height?: number }) => (
  // No slide-owned radius (G-15 story honesty): the Carousel viewport clips
  // slides at the knob radius — a pinned $3 held a 7px arc at
  // borderRadius:none (UX-P06 "Carousel slides br=7").
  <View backgroundColor={`$${color}3`} height={height} alignItems="center" justifyContent="center">
    <Text color={`$${color}12`} fontSize="$6" fontWeight="400">
      Slide {index + 1}
    </Text>
  </View>
);

export const Default: Story = {
  name: 'Main',
  render: () => (
    <View width={400}>
      <Carousel onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const WithoutArrows: Story = {
  render: () => (
    <View width={400}>
      <Carousel showArrows={false} onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const WithoutDots: Story = {
  render: () => (
    <View width={400}>
      <Carousel showDots={false} onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const Looping: Story = {
  render: () => (
    <View width={400}>
      <Carousel loop onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const AutoPlay: Story = {
  render: () => (
    <View width={400}>
      <Carousel autoPlay={3000} loop onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const InitialSlide: Story = {
  render: () => (
    <View width={400}>
      <Carousel initialSlide={2} onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 5).map((color, i) => (
          <SlideContent key={i} index={i} color={color} />
        ))}
      </Carousel>
    </View>
  ),
};

export const CustomGap: Story = {
  render: () => (
    <YStack gap="$4">
      <YStack gap="$2">
        <Text fontWeight="400">Default gap ($3)</Text>
        <View width={400}>
          <Carousel>
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={100} />
            ))}
          </Carousel>
        </View>
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="400">Larger gap ($6)</Text>
        <View width={400}>
          <Carousel gap="$6">
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={100} />
            ))}
          </Carousel>
        </View>
      </YStack>
    </YStack>
  ),
};

export const ImageCarousel: Story = {
  render: () => (
    <View width={500}>
      <Carousel loop>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} overflow="hidden">
            <Image
              src={`https://picsum.photos/500/300?random=${i}`}
              alt={`Sample landscape photo ${i}`}
              width="100%"
              height={300}
              objectFit="cover"
            />
          </View>
        ))}
      </Carousel>
    </View>
  ),
};

export const CardCarousel: Story = {
  render: () => (
    <View width={400}>
      <Carousel>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padding="$4" height={200}>
            <YStack gap="$2">
              <View width={60} height={60} backgroundColor="$color5" />
              <Text fontWeight="400" fontSize="$5">
                Card {i}
              </Text>
              <Text color="$color11" fontSize="$3">
                This is a sample card in the carousel. It demonstrates how cards can be used as slides.
              </Text>
            </YStack>
          </Card>
        ))}
      </Carousel>
    </View>
  ),
};

export const ManySlides: Story = {
  render: () => (
    <View width={400}>
      <Carousel loop onSlideChange={action('onSlideChange')}>
        {Array.from({ length: 10 }).map((_, i) => (
          <SlideContent key={i} index={i} color={colors[i % colors.length]} />
        ))}
      </Carousel>
    </View>
  ),
};

export const SingleSlide: Story = {
  render: () => (
    <View width={400}>
      <Carousel>
        <SlideContent index={0} color="blue" />
      </Carousel>
    </View>
  ),
};

/**
 * SLIDE-VIEWPORT-WIDTH check. The failure this locks against:
 * percent-of-track slide sizing inflates N fixed-width slides to N×W each, so
 * every slide past the first lands beyond max scroll while the dots animate
 * at nothing — dots alone can never catch it, only the geometry check can.
 */
export const SlideGeometry: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'LC-62 VERIFY: fixed 400px viewport, four fixed-width slides, default (non-zero) ' +
          "gap. Probe: for every N, click the dot `[aria-label='Go to item N']`, wait for " +
          "the smooth scroll to settle, and assert `[data-carousel-slide]` N's bounding box " +
          'intersects the `[data-carousel-track]` viewport box by ≥90% — the pitch must be ' +
          'index × (slideWidth + gap), sized from the MEASURED viewport, never ' +
          'percent-of-track.',
      },
    },
  },
  render: () => (
    <View width={400}>
      <Carousel onSlideChange={action('onSlideChange')}>
        {colors.slice(0, 4).map((color, i) => (
          // Fixed-width slide content (the gallery shape that exposed
          // the inflation): content exactly as wide as the viewport.
          <View key={i} width={400}>
            <SlideContent index={i} color={color} />
          </View>
        ))}
      </Carousel>
    </View>
  ),
};

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontWeight="400">Default (with arrows and dots)</Text>
        <View width={350}>
          <Carousel>
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={120} />
            ))}
          </Carousel>
        </View>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Without arrows</Text>
        <View width={350}>
          <Carousel showArrows={false}>
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={120} />
            ))}
          </Carousel>
        </View>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Without dots</Text>
        <View width={350}>
          <Carousel showDots={false}>
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={120} />
            ))}
          </Carousel>
        </View>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Loop enabled</Text>
        <View width={350}>
          <Carousel loop>
            {colors.slice(0, 3).map((color, i) => (
              <SlideContent key={i} index={i} color={color} height={120} />
            ))}
          </Carousel>
        </View>
      </YStack>
    </YStack>
  ),
};
