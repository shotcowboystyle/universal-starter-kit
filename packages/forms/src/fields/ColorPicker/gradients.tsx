import { View } from 'tamagui';

/**
 * Web ColorPicker gradient fills — CSS `linear-gradient` backgrounds.
 * Metro resolves `gradients.native.tsx` on iOS/Android instead.
 *
 * Saturation uses two stacked layers (not a comma-joined `background`) so
 * Tamagui/style serialization cannot drop the value overlay.
 *
 * `width`/`height` are accepted for API parity with the native module (unused on web).
 */

const fill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export function SaturationBackground({ hueColor }: { hueColor: string; width?: number; height?: number }) {
  return (
    <View {...fill} overflow="hidden">
      <View
        {...fill}
        style={{
          background: `linear-gradient(to right, #fff, ${hueColor})`,
        }}
      />
      <View
        {...fill}
        style={{
          background: 'linear-gradient(to top, #000, transparent)',
        }}
      />
    </View>
  );
}

export function HueBackground({
  orientation = 'horizontal',
}: {
  width?: number;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
}) {
  const dir = orientation === 'vertical' ? 'to bottom' : 'to right';
  return (
    <View
      {...fill}
      style={{
        background: `linear-gradient(${dir}, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`,
      }}
    />
  );
}

export function AlphaBackground({
  hex,
  orientation = 'horizontal',
}: {
  hex: string;
  width?: number;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
}) {
  const dir = orientation === 'vertical' ? 'to bottom' : 'to right';
  return (
    <>
      <View
        {...fill}
        style={{
          backgroundImage:
            'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(135deg, transparent 75%, #ccc 75%)',
          backgroundSize: '8px 8px',
          backgroundPosition: '0 0, 4px 0, 4px -4px, 0px 4px',
        }}
      />
      <View
        {...fill}
        style={{
          background: `linear-gradient(${dir}, transparent, ${hex})`,
        }}
      />
    </>
  );
}
