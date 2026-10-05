export type SafeAreaEdge = 'top' | 'bottom' | 'left' | 'right';
export type SafeAreaMode = 'padding' | 'margin';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const ALL_EDGES: SafeAreaEdge[] = ['top', 'bottom', 'left', 'right'];

/**
 * Map device insets onto padding or margin. Physical left/right (not
 * start/end) — notches and home indicators sit on the device, not the
 * reading direction.
 */
export function applySafeAreaInsets(
  insets: SafeAreaInsets,
  edges: SafeAreaEdge[] = ALL_EDGES,
  mode: SafeAreaMode = 'padding',
): Record<string, number> {
  const edgesSet = new Set(edges);
  if (mode === 'padding') {
    return {
      paddingTop: edgesSet.has('top') ? insets.top : 0,
      paddingBottom: edgesSet.has('bottom') ? insets.bottom : 0,
      paddingLeft: edgesSet.has('left') ? insets.left : 0,
      paddingRight: edgesSet.has('right') ? insets.right : 0,
    };
  }
  return {
    marginTop: edgesSet.has('top') ? insets.top : 0,
    marginBottom: edgesSet.has('bottom') ? insets.bottom : 0,
    marginLeft: edgesSet.has('left') ? insets.left : 0,
    marginRight: edgesSet.has('right') ? insets.right : 0,
  };
}
