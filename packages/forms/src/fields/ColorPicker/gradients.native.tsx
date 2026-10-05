import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View as RNView } from 'react-native';

/**
 * Native ColorPicker gradient fills — `expo-linear-gradient`.
 * Web keeps CSS via `gradients.tsx` (Metro platform extension).
 *
 * Uses RN View + explicit width/height (not Tamagui absolute fill) so the
 * native gradient view always gets a non-zero layout box in Expo Go.
 */

const HUE_COLORS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;
const HUE_LOCATIONS = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1] as const;

const TRANSPARENT = 'rgba(0,0,0,0)';

export function SaturationBackground({ hueColor, width, height }: { hueColor: string; width: number; height: number }) {
  const box = { width, height };
  return (
    <RNView style={[styles.host, box]} pointerEvents="none">
      <LinearGradient
        colors={['#FFFFFF', hueColor]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[TRANSPARENT, '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </RNView>
  );
}

function axis(orientation: 'horizontal' | 'vertical' | undefined) {
  return orientation === 'vertical'
    ? { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } }
    : { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
}

export function HueBackground({
  width,
  height,
  orientation = 'horizontal',
}: {
  width: number;
  height: number;
  orientation?: 'horizontal' | 'vertical';
}) {
  const { start, end } = axis(orientation);
  return (
    <LinearGradient
      colors={[...HUE_COLORS]}
      locations={[...HUE_LOCATIONS]}
      start={start}
      end={end}
      style={[styles.host, { width, height }]}
      pointerEvents="none"
    />
  );
}

export function AlphaBackground({
  hex,
  width,
  height,
  orientation = 'horizontal',
}: {
  hex: string;
  width: number;
  height: number;
  orientation?: 'horizontal' | 'vertical';
}) {
  const box = { width, height };
  const { start, end } = axis(orientation);
  return (
    <RNView style={[styles.host, box]} pointerEvents="none">
      <RNView style={[StyleSheet.absoluteFill, { backgroundColor: '#E5E5E5' }]} />
      <RNView style={[StyleSheet.absoluteFill, { backgroundColor: '#BBBBBB', opacity: 0.35 }]} />
      <LinearGradient colors={[TRANSPARENT, hex]} start={start} end={end} style={StyleSheet.absoluteFill} />
    </RNView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
});
