/**
 * BarcodePreview — the drawn face of the barcode field, not the input.
 * Barcode.stories.tsx mounts the field; this file mounts the preview alone
 * so Kitchen Sink can show QR and Code 128 without a scanner.
 *
 * QR polarity is themed ($color on $background); these stories do not pin
 * dark-on-light.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, XStack, YStack } from 'tamagui';

import { BarcodePreview } from './BarcodePreview';

const meta: Meta<typeof BarcodePreview> = {
  title: 'Forms/BarcodePreview',
  component: BarcodePreview,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Canvas-free barcode/QR preview. Theme ink on theme surface in both schemes. MPO-94 (pin vs themed QR polarity) is not taken here.',
      },
    },
  },
  argTypes: {
    value: { control: 'text' },
    format: { control: 'select', options: ['code128', 'qr', 'qrcode'] },
    height: { control: 'number' },
    moduleWidth: { control: 'number' },
    showText: { control: 'boolean' },
    textFallback: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof BarcodePreview>;

export const Main: Story = {
  name: 'Main',
  args: {
    value: 'SKU-001234',
    height: 36,
    showText: true,
  },
};

export const Code128: Story = {
  args: {
    value: 'SKU-001234',
    format: 'code128',
    height: 36,
    showText: true,
  },
};

/**
 * QR face. Height 120 so a short payload draws at a whole
 * pixel per module. Polarity stays themed.
 */
export const Qr: Story = {
  args: {
    value: 'SHC-42',
    format: 'qr',
    height: 120,
    showText: true,
  },
};

/** Host owns the empty marker; the preview paints nothing. */
export const Empty: Story = {
  render: () => (
    <YStack gap="$2">
      <Text fontSize="$2" color="$color10">
        empty value — preview is null
      </Text>
      <BarcodePreview value="" format="qr" height={72} />
    </YStack>
  ),
};

/**
 * Polarity specimen. The QR face is pinned dark-on-light in both schemes
 * (a reversed QR is optional for a reader), while the Code 128 strip
 * paints $color on $background and follows the scheme. Flip the scheme to
 * see one face hold and the other move.
 */
export const ThemedPolarity: Story = {
  render: () => (
    <XStack gap="$6" flexWrap="wrap" padding="$4" alignItems="flex-end">
      <YStack gap="$2" alignItems="center">
        <Text fontSize="$2" color="$color10">
          QR (pinned dark-on-light)
        </Text>
        <BarcodePreview value="SHC-42" format="qr" height={120} showText />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Text fontSize="$2" color="$color10">
          Code 128 (themed)
        </Text>
        <BarcodePreview value="SKU-001234" format="code128" height={36} showText />
      </YStack>
    </XStack>
  ),
};
