import { useTouchSurface, isTouchSurface, sizeRecipeForToken, textFieldInset } from '@repo/theme';
import type { SizeVariantSpreadFunction } from '@tamagui/web';
import { TextArea as TamaguiTextArea, isWeb, styled } from 'tamagui';

/**
 * Tamagui's built-in TextArea has a `size` variant that sets `borderRadius`
 * via `getButtonSized` and `fontWeight` via `getFontSized`. On web, that
 * variant's atomic CSS class can override a directly-passed `borderRadius` or
 * `fontWeight` prop due to CSS cascade ordering (RM-TXT-6: value stayed 400
 * while the helper, which never takes `size`, painted 700).
 *
 * This wrapper overrides the `size` variant to omit `borderRadius` and to bake
 * a caller `fontWeight` into the winning class. Control chrome (font, pad,
 * line box) comes from size recipes, not getFontSized/getSpace.
 *
 * NOTE: A similar wrapper for Input is not feasible because `styled()` on
 * Tamagui's `.styleable()` Input breaks native HTML attribute forwarding
 * (e.g., `disabled`). Input-based components should use alternative approaches.
 *
 * Rows-based height needs `extras.props`, so this stays a `"...size"` function
 * that calls `sizeRecipeForToken` rather than the static type-variant map.
 */

const textAreaSizeWithoutRadius: SizeVariantSpreadFunction<any> = (val, extras) => {
  const { props } = extras;
  const recipe = sizeRecipeForToken(String(val || '$true'), {
    touch: props.touch ?? (!isWeb && isTouchSurface()),
  });
  const inset = textFieldInset(recipe);
  const lineHeight = Math.round(recipe.fontSize * 1.25);
  const lines = props.rows ?? props.numberOfLines;
  const height = typeof lines === 'number' ? lines * lineHeight + recipe.gap * 2 : 'auto';
  return {
    fontSize: recipe.fontSize,
    ...(isWeb ? { lineHeight } : undefined),
    // Same cascade as radius: when the caller set a weight, put it on the
    // size class so the atomic cannot pin the UA/token 400.
    ...(props.fontWeight != null ? { fontWeight: props.fontWeight } : undefined),
    // padX === padY === optical inset. Never more padX than padY.
    paddingVertical: inset,
    paddingHorizontal: inset,
    height,
  };
};

const ThemedTextAreaFrame = styled(TamaguiTextArea, {
  name: 'ThemedTextArea',
  variants: {
    touch: { true: {}, false: {} },
    size: {
      '...size': textAreaSizeWithoutRadius,
    },
  } as const,
});

export const ThemedTextArea = ThemedTextAreaFrame.styleable((props, ref) => {
  const touch = useTouchSurface();
  return <ThemedTextAreaFrame {...props} touch={touch} ref={ref} />;
});
