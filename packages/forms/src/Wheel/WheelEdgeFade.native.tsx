import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View as RNView } from 'react-native';
import { useTheme } from 'tamagui';

function toTransparent(color: string): string {
  const fnMatch = color.match(/^(rgb|hsl)a?\(([^)]+)\)$/i);
  if (fnMatch) {
    const parts = fnMatch[2].split(',').map((part) => part.trim());
    const [a, b, c] = parts;
    return `${fnMatch[1].toLowerCase()}a(${a}, ${b}, ${c}, 0)`;
  }
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  return 'transparent';
}

/**
 * Cylinder fade toward the edges. Overlay (not row opacity) so inactive
 * numerals stay on the $color11 ramp (Wheel contrast contract).
 */
export function WheelEdgeFade({ height }: { height: number }) {
  const theme = useTheme();
  const background = theme.background?.val ?? '#ffffff';
  const transparent = toTransparent(background);
  if (height <= 0) {
    return null;
  }
  return (
    <>
      <RNView pointerEvents="none" style={[styles.band, { top: 0, height }]}>
        <LinearGradient
          colors={[background, transparent]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </RNView>
      <RNView pointerEvents="none" style={[styles.band, { bottom: 0, height }]}>
        <LinearGradient
          colors={[transparent, background]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </RNView>
    </>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
  },
});
