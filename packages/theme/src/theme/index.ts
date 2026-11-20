export { activateThemeConfig } from './activate-theme-config';
export { animationConfig, animationNames, animations } from './animations/index';
export type { AnimationName } from './animations/index';
export { accentIdentityCandidates, resolveChartPalette, useChartPalette } from './chart-palette';
export type { ChartPalette, ResolveChartPaletteInput } from './chart-palette';
export {
  $color,
  aaTextContrastRatio,
  assertContrast,
  buttonColors,
  contrastRatio,
  findReadableStep,
  holdInkFloor,
  inputColors,
  measureContrast,
  minContrastRatio,
  normalizeColorScale,
  normalizeToHex,
  pickReadableForeground,
  relativeLuminance,
  resolveThemeContrast,
  semanticGroups,
} from './color-rules';
export type {
  ButtonColorConfig,
  ColorRamp,
  ColorStep,
  ComponentColorConfig,
  ContrastPair,
  ContrastReport,
  SemanticGroup,
  ThemeContrastPair,
} from './color-rules';
export {
  computeOverrides,
  cookieOverridesPrefix,
  cookiePreset,
  getCookieWatchList,
  joinSplitCookieValues,
  loadPresetOverrides,
  persistPresetOverrides,
  readOverridesCookie,
  readPresetCookie,
  splitCookieValue,
  writeOverridesCookie,
  writePresetCookie,
} from './cookies';
export {
  applyRootCornerSmoothing,
  CORNER_SHAPE_CSS_VAR,
  CORNER_SHAPE_ROUND,
  CORNER_SHAPE_ROUND_COMPUTED,
  CORNER_SHAPE_SMOOTH,
  CORNER_SHAPE_SMOOTH_COMPUTED,
  CORNER_SMOOTHING_ROOT_ATTR,
  CORNER_SMOOTHING_STYLE_TAG_ID,
  cornerSmoothClassName,
  cornerSmoothingCss,
  CornerSmoothingStyles,
  cssSupportsCornerShape,
  ensureCornerSmoothingStyles,
  isRoundComputedCornerShape,
  isSmoothComputedCornerShape,
  readComputedCornerShape,
} from './corner-smoothing';
export { createDefaultThemeConfig, TAMAGUI_ERA, tamaguiEra } from './create-default-theme-config';
export type { CreateDefaultThemeConfigOptions } from './create-default-theme-config';
export { createThemesBuilder, tintHueNames } from './create-themes';
export type {
  BaseThemeBuilderDefinition,
  CreateThemesBuilderOptions,
  GetThemeProps,
  Shadows,
  ThemeBuilderDefinition,
} from './create-themes';
export {
  BODY_LINE_HEIGHT_OFFSET,
  bodyFontLineHeights,
  bodyFontSizes,
  bodyLineHeightPx,
  categoryLineHeights,
  createCategoryFont,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBlackletterFont,
  defaultBodyFont,
  defaultBuilderOptions,
  defaultCategoryFonts,
  defaultCondensedFont,
  defaultCursiveFont,
  defaultFonts,
  defaultGeometricFont,
  defaultHandwritingFont,
  defaultHeadingFont,
  defaultMonoFont,
  defaultPixelFont,
  defaultRoundedFont,
  defaultSerifFont,
  defaultSlabFont,
  fontFamilyStacks,
  interTrackingEm,
  interTrackingPx,
} from './defaults/index';
export type { FontFamilyCategory } from './defaults/index';
export { ThemeDevtoolsPanel } from './devtools/ThemeDevtoolsPanel';
export type { TamaguiConfigLike, ThemeDevtoolsPanelProps } from './devtools/ThemeDevtoolsPanel';
export {
  ensureFocusVisibleRing,
  FOCUS_RING_CLIPPED_OFFSET,
  FOCUS_RING_HALO_OFFSET,
  FOCUS_RING_MIN_CONTRAST,
  FOCUS_RING_MIN_WIDTH,
  FOCUS_VISIBLE_RING,
  FOCUS_VISIBLE_RING_HALO,
  FOCUS_VISIBLE_RING_INSET,
  focusRingColorMeetsContrast,
  isSanctionedFocusRingOffset,
  SANCTIONED_FOCUS_RING_OFFSETS,
  STATE_LAYER_HOVER,
  STATE_LAYER_PRESS,
  withDefaultStateLayer,
} from './focus-state';
export { resolveGlyphPaint, useGlyphColor } from './glyph-paint';
export { flooredLineHeight, fontCategoryMetrics } from './font-category-metrics';
export { fontCategoryStacks } from './font-category-stacks';
export { buildFontKnobCss, FontKnobStyles, getConfiguredFontFamily, getConfiguredFontTables } from './FontKnobStyles';
export type { FontScopeTables } from './FontKnobStyles';
export {
  getGroupPosition,
  GroupPositionContext,
  stackEdgeRadius,
  stackRadiusProps,
  useGroupPosition,
} from './group-geometry';
export type { GroupOrientation, GroupPosition, StackRadiusFragment } from './group-geometry';
export { ensureHairlineFallback, hairline, hairlineFallbackCss, hairlineWidth } from './hairline';
export { Intent } from './Intent';
export type { IntentProps } from './Intent';
export { defaultIntents } from './intents';
export {
  BodyFont,
  BorderRadius,
  BorderWidth,
  BulkBarPlacement,
  CornerSmoothing,
  defaultKnobs,
  Density,
  DisabledStyle,
  Elevation,
  emptyStateKnobs,
  FieldLabelPlacement,
  FillStyle,
  FontCategory,
  FontWeight,
  FormAutofocus,
  HeadingFont,
  interactionStates,
  PageTitleScale,
  RequiredMarking,
  SelectAllScope,
  Size,
  Space,
  TableZebra,
  TextAccent,
  TimestampStyle,
} from './knobs';
export type { Animation, InteractionState, Knobs, StateKnobs } from './knobs';
export {
  defaultMaxPanes,
  getLayoutSizeClass,
  isTouchSurface,
  LAYOUT_SIZE_CLASS_ORDER,
  layoutBreakpoints,
  layoutSizeClassAtLeast,
  MIN_PRESS_TARGET,
  NARROW_BREAKPOINT,
  OVERLAY_ANCHOR_GAP,
  OVERLAY_ATTACH_GAP,
  OVERLAY_BREAKPOINT,
  pressTargetHitSlop,
  pressTargetStyle,
  READING_WIDTH_CH,
  READING_WIDTH_MAX_CH,
  READING_WIDTH_MIN_CH,
  readingWidthStyle,
  useLayoutSizeClass,
  useMultiPane,
  useSemanticGaps,
} from './layout-tokens';
export type {
  HitSlopInsets,
  LayoutBreakpointName,
  LayoutSizeClass,
  PressTargetStyle,
  ReadingWidthStyle,
} from './layout-tokens';
export { Preset } from './Preset';
export type { PresetProps } from './Preset';
export type { Preset as PresetDefinition, IntentOverride } from './preset.types';
export { PresetContext, usePresetContext, usePresetTints } from './preset-context';
export type { PresetContextValue } from './preset-context';
export { boldPreset, defaultPreset, heroPreset } from './presets';
export {
  radiusClassProps,
  radiusOverrideFor,
  radiusResolutionProps,
  resolveRadiusClass,
  resolveRadiusForPart,
} from './radius-class';
export type {
  KnobImmuneRadiusClass,
  RadiusClassDeclaration,
  RadiusClassGeometry,
  RadiusResolutionDeclaration,
  ResolvedPartRadius,
  ResolvedRadiusSource,
  ResolveRadiusForPartOptions,
} from './radius-class';
export {
  OPEN_RADIUS_ADJUDICATIONS,
  RADIUS_OVERRIDE_TABLE,
  RADIUS_RESOLUTION_COMPOSITION,
  RADIUS_RESOLUTION_STOPS,
  RADIUS_RESOLUTION_TABLE,
} from './radiusClassTable.generated';
export type {
  OpenRadiusAdjudication,
  RadiusOverrideEntry,
  RadiusResolutionCell,
  RadiusResolutionClass,
  RadiusResolutionRow,
  RadiusResolutionStop,
} from './radiusClassTable.generated';
export {
  resolveAaSolidFill,
  resolveAccentTintedSurface,
  resolveLegibleInkOn,
  useAaSolidFill,
  useAccentOnSurface,
  useAccentTintedSurface,
  useLegibleInkOn,
  useReadableTextOn,
} from './readable-color';
export type { AaSolidCandidate, ResolveAaSolidFillInput, ResolveAccentTintedSurfaceInput } from './readable-color';
export type {
  ControlStateProps,
  CornerSmoothingCarrier,
  DisabledAssemblyProps,
  DisabledChromeProps,
  DisabledRecipe,
  DisabledSurfaceProps,
  DisabledTextProps,
  ElevationChromeProps,
  ElevationPaintProps,
  ElevationStateProps,
  ElevationToken,
  KnobProps,
  KnobPropsOverride,
  KnobRecipe,
  ResolvedKnobs,
  TextStateProps,
} from './recipes';
export {
  applyDensity,
  borderRadiusMap,
  capContainerRadius,
  // oxlint-disable-next-line typescript/no-deprecated -- deprecated alias kept in the public API until consumers migrate
  compactSizeMap,
  compactSpaceMap,
  containerCapProps,
  elevationMap,
  overlayElevationMap,
  radiusStopFromToken,
  resolveKnobs,
  resolvePageTitleScale,
} from './resolve-knobs';
export type { CappedContainer, ColorScheme, ContainerCapDeclaration } from './resolve-knobs';
export {
  clearPresets,
  createThemeConfig,
  getPreset,
  getPresetNames,
  registerPreset,
  resolveThemeFromPreset,
} from './shared';
export type { ThemeConfig } from './shared';
export { assertResolvableThemeValues, isResolvableThemeValue } from './theme-value';
export {
  applyRadiusStop,
  applyTouchFloor,
  cloneSizeRecipeInputs,
  createRecipeFamilies,
  DEFAULT_SIZE_RECIPE_INPUTS,
  defaultRecipeInputs,
  defaultSizeFactors,
  generateSizeRecipes,
  generateSizeRecipeTables,
  getGeneratedSizeRecipes,
  getSizeRecipeFamily,
  getSizeRecipeInputs,
  getTileSizeLadder,
  mergeRecipeInputs,
  recipeFamilies,
  recipeFromTokenChannels,
  resolveControlRadius,
  resolveSizeRecipeInputs,
  setSizeRecipeInputs,
  SIZE_RECIPE_COMPACT_RATIOS,
  SIZE_RECIPE_FAMILY_NAMES,
  SIZE_RECIPE_HEIGHTS,
  SIZE_RECIPE_HEIGHTS_TOUCH,
  SIZE_RECIPE_RADII,
  SIZE_RECIPE_RADIUS_STOPS,
  SIZE_RECIPE_RADIUS_TOKEN_TO_STOP,
  SIZE_RECIPE_RATIOS,
  SIZE_RECIPE_TOKENS,
  SIZE_TOKEN_EXPONENTS,
  sizeRecipeBoxVariants,
  sizeRecipeEscape,
  sizeRecipeForToken,
  sizeRecipeFromHeight,
  sizeRecipeIconVariants,
  sizeRecipes,
  sizeRecipeTypeVariants,
  TAMAGUI_COMPACT_SIZE_TABLE,
  TAMAGUI_CONTROL_SIZE_TABLE,
  TAMAGUI_INPUT_PADX,
  textFieldInset,
  tileSizeLadder,
  TOUCH_HEIGHT_FLOOR,
} from './size-recipes';
export type {
  GeneratedSizeRecipes,
  RecipeFamilies,
  // oxlint-disable-next-line typescript/no-deprecated -- deprecated alias kept in the public API until consumers migrate
  RecipeFamilyName,
  // oxlint-disable-next-line typescript/no-deprecated -- deprecated alias kept in the public API until consumers migrate
  RecipeInputs,
  SizeRecipe,
  SizeRecipeBoxVariant,
  SizeRecipeFamily,
  SizeRecipeFamilyName,
  SizeRecipeIconVariant,
  SizeRecipeInputs,
  SizeRecipeRadiusStop,
  SizeRecipeRatios,
  SizeRecipeTables,
  SizeRecipeToken,
  SizeRecipeTokenChannels,
  SizeRecipeTokenTable,
  SizeRecipeTypeVariant,
} from './size-recipes';
export { subsetThemes } from './subset-themes';
export type { ThemeSubset } from './subset-themes';
export { Surface } from './Surface';
export {
  clampSurfaceDensity,
  clampSurfaceSize,
  normalizeSurfaceSize,
  SURFACE_DENSITY_RANK,
  SURFACE_SIZE_RANK,
  SurfaceContext,
} from './surface-context';
export type { SurfaceDensity, SurfaceIntent, SurfaceSize, SurfaceSizeIntent } from './surface-context';
export {
  cloneTileSizeInputs,
  defaultTileSizeInputs,
  defaultWidthFactors,
  generateTileSizeLadder,
  mediaAspectRatios,
  resolveMediaAspect,
  resolveTileSizeInputs,
  tileColumnsForWidth,
  tileRungFlexProps,
  tileSizeRungs,
  tileSizeStepExponents,
} from './tile-sizes';
export type {
  MediaAspect,
  MediaAspectName,
  TileRungFlexProps,
  TileSizeInputs,
  TileSizeLadder,
  TileSizeRung,
  TileSizeStop,
} from './tile-sizes';
export { transitionProps } from './transition-props';

export { startThemeTransition, ThemeProvider } from './theme';
export type { ThemeProviderProps } from './theme';
export { Tint, useTintDepth } from './Tint';
export type { TintProps } from './Tint';
export {
  IntentContext,
  solidButtonIntents,
  solidPaletteThemes,
  useIntentContext,
  useResolvedKnobs,
} from './use-resolved-knobs';
export type { UseResolvedKnobsOptions } from './use-resolved-knobs';
export { useTheme } from './use-theme';
export type { ThemeScheme } from './use-theme';
export { useTouchSurface } from './use-touch-surface';
