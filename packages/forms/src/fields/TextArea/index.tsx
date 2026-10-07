import { containerCapProps, useTouchSurface } from '@repo/theme';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColorTokens, LabelProps, SizeTokens } from 'tamagui';
import { Paragraph, YStack, XStack, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/color-ramps';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { ThemedTextArea } from '../../themed-primitives';
import type { AnyFormApi } from '../../types';
import { isObjectLike, isString, themeTokenValue } from '../field-helpers';

type TamaguiTextAreaProps = ComponentProps<typeof ThemedTextArea>;

type AnyHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

type CountPosition = 'bottom-left' | 'bottom-right' | 'top-right';

export interface TextAreaProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: string;
  defaultValue?: string;
  /** Canonical change contract: emits the string value. */
  onChange?: (value: string) => void;
  /** @deprecated Use onChange. Still fires from the same emit site. */
  onChangeText?: (text: string) => void;
  onBlur?: AnyHandler;
  placeholder?: string;
  textAreaProps?: Omit<TamaguiTextAreaProps, 'value' | 'id' | 'onChange' | 'onChangeText'>;
  numberOfLines?: number;
  maxLength?: number;
  showCount?: boolean;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
  countPosition?: CountPosition;
  /** Ref forwarded to the underlying textarea element */
  textAreaRef?: Ref<unknown>;
  /** Rendered inside the positioning wrapper, after the textarea box (useful for overlays like mention suggestions) */
  renderOverlay?: () => ReactNode;
  /** When true, renders a skeleton placeholder instead of the textarea */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

/** An error prop is set when it is a non-empty message or `true`. */
const isErrorValue = (value: string | boolean | undefined): boolean =>
  value !== undefined && value !== false && value !== '';

/** Hands a node to a consumer ref of either kind (callback or object). */
const assignRef = (ref: Ref<unknown> | undefined, node: unknown) => {
  if (ref instanceof Function) {
    ref(node);
  } else if (ref != null) {
    ref.current = node;
  }
};

const characterCountLabel = (safeLength: number, maxLength: number | undefined): string => {
  if (maxLength == null) {
    return `${safeLength} characters`;
  }
  const remaining = maxLength - safeLength;
  return remaining < 0
    ? `${Math.abs(remaining)} over the ${maxLength} character limit`
    : `${remaining} remaining of ${maxLength}`;
};

/** Live "n/max" (or "n characters") line, inside the box at the bottom or above it at the top. */
const CharacterCount = ({
  length,
  maxLength,
  countPosition,
  countId,
  countLive,
}: {
  length: number;
  maxLength?: number;
  countPosition: CountPosition;
  countId?: string;
  countLive: boolean;
}) => {
  const safeLength = Math.max(0, length);
  const isOverLimit = maxLength != null && maxLength - safeLength < 0;
  const text = maxLength == null ? `${safeLength} characters` : `${safeLength}/${maxLength}`;
  return (
    <XStack
      justifyContent={countPosition.endsWith('right') ? 'flex-end' : 'flex-start'}
      pointerEvents="none"
      {...(countPosition.startsWith('top')
        ? { marginBottom: '$2' }
        : {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: '$3',
            paddingBottom: '$2',
          })}>
      <Paragraph
        {...(hasText(countId) ? { id: countId } : undefined)}
        size="$2"
        color={isOverLimit ? formCommonColors.error : formCommonColors.muted}
        aria-label={characterCountLabel(safeLength, maxLength)}
        aria-live={countLive ? 'polite' : 'off'}
        aria-atomic="true">
        {text}
      </Paragraph>
    </XStack>
  );
};

/** Row/height sizing: auto-resize bounds, an explicit `numberOfLines`, or the `minRows` default. */
const resizeStyleFor = ({
  autoResize,
  autoHeight,
  minHeightPx,
  maxHeightPx,
  numberOfLines,
  minRows,
  lineHeightFor,
}: {
  autoResize: boolean;
  autoHeight: number | undefined;
  minHeightPx: number;
  maxHeightPx: number;
  numberOfLines: number | undefined;
  minRows: number;
  lineHeightFor: (rows: number) => number;
}) => {
  if (autoResize) {
    return {
      minHeight: minHeightPx,
      maxHeight: maxHeightPx,
      ...(autoHeight === undefined ? undefined : { height: autoHeight }),
      overflow: autoHeight !== undefined && autoHeight >= maxHeightPx ? ('scroll' as const) : ('hidden' as const),
    };
  }
  if (numberOfLines !== undefined && numberOfLines !== 0) {
    return { numberOfLines, minHeight: lineHeightFor(numberOfLines) };
  }
  return { numberOfLines: minRows, minHeight: minHeightPx };
};

export const TextArea = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onChangeText,
  onBlur,
  placeholder,
  textAreaProps,
  numberOfLines,
  maxLength,
  showCount,
  autoResize = false,
  minRows = 3,
  maxRows = 10,
  countPosition = 'bottom-right',
  textAreaRef: textAreaRefProp,
  renderOverlay,
  skeleton,
  compact,
}: TextAreaProps) => {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const theme = useTheme();
  const [charCount, setCharCount] = useState(() => (value ?? defaultValue ?? '').length);
  const [countLive, setCountLive] = useState(false);

  const textAreaNodeRef = useRef<unknown>(null);
  // Keeps our own handle for measuring while still handing the node to the consumer's ref.
  const bindTextArea = useCallback(
    (node: unknown) => {
      textAreaNodeRef.current = node;
      assignRef(textAreaRefProp, node);
    },
    [textAreaRefProp],
  );
  const [autoHeight, setAutoHeight] = useState<number | undefined>();
  // SAFETY: theme values are resolved color strings; the prop type lists only color tokens but RN/RN-web accept any color string
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const placeholderTextColor = (themeTokenValue(theme, 'placeholderColor') ?? formCommonColors.muted) as ColorTokens;

  // SAFETY: knobProps.sizeToken is always a Tamagui size token; the cast only narrows its string type.
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSize, minRows === 0 ? 3 : minRows, hydrationTouch);
  const maxHeightPx = getFieldHeight(resolvedSize, maxRows, hydrationTouch);
  // Polaris/GOV.UK: a declared limit always surfaces a live count. Explicit
  // `showCount={false}` ejects.
  const showCharacterCount = showCount ?? maxLength != null;
  const countId = showCharacterCount && hasText(id) ? `${id}-count` : undefined;

  const measureAndResize = useCallback(() => {
    if (!autoResize || !isWeb) {
      return;
    }
    const textAreaElement = textAreaNodeRef.current;
    if (!(textAreaElement instanceof HTMLTextAreaElement)) {
      return;
    }
    textAreaElement.style.height = 'auto';
    const clamped = Math.min(Math.max(textAreaElement.scrollHeight, minHeightPx), maxHeightPx);
    textAreaElement.style.height = `${clamped}px`;
    setAutoHeight(clamped);
  }, [autoResize, minHeightPx, maxHeightPx]);

  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the text itself is the trigger: every value change re-measures the box
  useEffect(() => {
    if (autoResize && isWeb) {
      requestAnimationFrame(measureAndResize);
    }
  }, [autoResize, measureAndResize, value, defaultValue]);

  const handleContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      if (!autoResize) {
        return;
      }
      const contentHeight = e.nativeEvent?.contentSize?.height;
      if (contentHeight != null) {
        setAutoHeight(Math.min(Math.max(contentHeight, minHeightPx), maxHeightPx));
      }
    },
    [autoResize, minHeightPx, maxHeightPx],
  );

  const layoutBind = {
    id,
    label,
    labelProps,
    helperText,
    required,
    disabled,
    size: resolvedSize,
    knobProps,
    placeholder,
  };

  // FieldLayout keeps label/helper anatomy; only the control is the skeleton.
  if (skeleton) {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={minHeightPx}
            {...knobProps.containerRadius}
          />
        </InputParts>
      </FieldLayout>
    );
  }

  const renderCount = (length: number) =>
    showCharacterCount ? (
      <CharacterCount
        length={length}
        maxLength={maxLength}
        countPosition={countPosition}
        countId={countId}
        countLive={countLive}
      />
    ) : null;

  const countInside = showCharacterCount && countPosition.startsWith('bottom');

  const resizeStyle = resizeStyleFor({
    autoResize,
    autoHeight,
    minHeightPx,
    maxHeightPx,
    numberOfLines,
    minRows,
    lineHeightFor: (rows) => getFieldHeight(resolvedSize, rows, hydrationTouch),
  });

  const isControlled = value !== undefined;
  const isFormBound = resolvedForm !== undefined && hasText(name);

  // Count from the live value whenever an upstream source drives the field
  // (controlled `value` prop or TanStack field state): the mount-only
  // charCount state froze counts for values applied after first paint
  // (create-mode seeding, setFieldValue). Uncontrolled standalone keeps the
  // keystroke-fed local state (its defaultValue never changes underneath).
  const countFrom = (textValue: string | undefined) =>
    isControlled || isFormBound ? (textValue ?? '').length : charCount;

  // Consumer `style` ejects after the field's own (fontWeight is inline so it
  // beats the size atomic in the stylesheet, RM-TXT-6).
  const consumerStyleProp = textAreaProps?.style;
  // SAFETY: a consumer `style` reaching a text input is a style object; the registered-style number brand in StyleProp is never passed here.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StyleProp also admits registered-style numbers and arrays, which cannot be spread by type
  const consumerStyle = (isObjectLike(consumerStyleProp) ? consumerStyleProp : undefined) as object | undefined;
  const bodyFontWeight = knobProps.body.fontWeight;
  const baseStyle = {
    ...(bodyFontWeight == null ? undefined : { fontWeight: bodyFontWeight }),
    ...consumerStyle,
  };
  const platformProps = isWeb
    ? {
        // Polaris multiline: no native resize (Box clips it). Primer
        // vertical resize is the autoResize=false fallback only when
        // the host does not clip — we keep none so the inset ring
        // and overflow:hidden stay intact.
        style: {
          resize: 'none' as const,
          overflowWrap: 'anywhere' as const,
          ...baseStyle,
        },
        ...(countInside ? { paddingBottom: '$5' } : undefined),
      }
    : {
        style: baseStyle,
        ...(countInside ? { paddingBottom: '$5' } : undefined),
      };

  const renderTextArea = (
    textValue: string | undefined,
    handleChange: ((text: string) => void) | undefined,
    hasError: boolean,
  ) => (
    <>
      {showCharacterCount && countPosition.startsWith('top') && renderCount(countFrom(textValue))}
      <YStack
        position="relative"
        width="100%">
        <InputParts.Box
          height="auto"
          width="100%"
          alignItems="stretch"
          {...knobProps.containerRadius}
          {...containerCapProps('TextArea', knobProps.borderRadius.borderRadius, knobProps.space)}
          cursor={disabled ? 'not-allowed' : 'text'}
          theme={hasError ? 'error' : undefined}
          // Box owns the disabled chrome wash (value text stays >= AA);
          // the old 0.5 whole-box dim dropped text under the floor.
          disabled={disabled}>
          <InputParts.TextArea
            innerRef={bindTextArea}
            size={knobProps.sizeToken}
            {...knobProps.body}
            // fontWeight after size, and baked into ThemedTextArea's size
            // variant: Tamagui's size atomic otherwise pins 400 (RM-TXT-6).
            fontWeight={knobProps.body.fontWeight}
            // T-VALUE: entered text stays the full ramp. textAccent honours
            // on the FieldLayout helper, not here.
            color="$color"
            backgroundColor="transparent"
            borderWidth={0}
            borderColor="transparent"
            {...resizeStyle}
            multiline
            {...textAreaProps}
            {...platformProps}
            placeholderTextColor={placeholderTextColor}
            {...(maxLength == null ? undefined : { maxLength })}
            {...(placeholder === undefined ? undefined : { placeholder })}
            disabled={disabled}
            readOnly={readOnly === true}
            {...(disabled ? { cursor: 'not-allowed' as const } : undefined)}
            {...(readOnly ? { 'aria-readonly': true } : undefined)}
            aria-required={required ? true : undefined}
            aria-invalid={hasError ? true : undefined}
            aria-multiline="true"
            {...(hasText(countId) ? { 'aria-describedby': countId } : undefined)}
            id={id}
            {...(isControlled ? { value: textValue } : { defaultValue: textValue })}
            onFocus={(e) => {
              setCountLive(true);
              textAreaProps?.onFocus?.(e);
            }}
            onChangeText={(text) => {
              if (disabled || readOnly) {
                return;
              }
              setCharCount(text.length);
              handleChange?.(text);
              onChange?.(text);
              onChangeText?.(text);
              measureAndResize();
            }}
            {...(autoResize && !isWeb ? { onContentSizeChange: handleContentSizeChange } : undefined)}
            onBlur={(e) => {
              setCountLive(false);
              textAreaProps?.onBlur?.(e);
            }}
          />
        </InputParts.Box>
        {countInside && renderCount(countFrom(textValue))}
        {renderOverlay?.()}
      </YStack>
    </>
  );

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}
        onBlur={onBlur}>
        <InputParts
          size={resolvedSize}
          {...(isErrorValue(error) ? { theme: 'error' } : undefined)}>
          {renderTextArea(value ?? defaultValue, undefined, isErrorValue(error))}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const fieldValue: unknown = field.state.value;
        return (
          <FieldLayout
            {...layoutBind}
            error={resolvedError}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <InputParts
              size={resolvedSize}
              {...(isErrorValue(resolvedError) ? { theme: 'error' } : undefined)}>
              {renderTextArea(
                isString(fieldValue) ? fieldValue : undefined,
                (text) => {
                  // SAFETY: the field is bound to this textarea's string value, so handleChange accepts the string it is given.
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field API's value type is erased to `never` for a form of unknown shape
                  field.handleChange(text as never);
                },
                isErrorValue(resolvedError),
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};
