export * from './theme/index';
export * from './dates';
export * from './numbers';
export * from './devWarn';
export * from './keyboardFocusRing';
export * from './menuRow';
export * from './font';
export * from './fonts/index';

// Contrast + matrix assertions downstream repos call. The full
// audit surface including the browser-side capturer stays on ./audit.
export { diffGeometry, evaluateNoBreakage, evaluateTextContrast } from './audit';
export type {
  GeometryDiff,
  MatrixTextSample,
  NoBreakageInput,
  NoBreakageResult,
  TextContrastResult,
  TextContrastViolation,
} from './audit';

// Thin type re-exports so packages/apps never import @tamagui/web directly.
export type { GenericFonts, MediaQueryKey, ThemeName } from '@tamagui/web';
