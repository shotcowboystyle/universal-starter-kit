import { containerCapProps, useTouchSurface } from '@repo/theme';
import type { ComponentProps, Ref, RefObject, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Paragraph, YStack, XStack, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/colorRamps';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import { ThemedTextArea } from '../../themedPrimitives';
import type { AnyFormApi } from '../../types';

type TamaguiTextAreaProps = ComponentProps<typeof ThemedTextArea>;

export interface TextAreaProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
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
  onBlur?: (...args: any[]) => void;
  placeholder?: string;
  textAreaProps?: Omit<TamaguiTextAreaProps, 'value' | 'id' | 'onChange' | 'onChangeText'>;
  numberOfLines?: number;
  maxLength?: number;
  showCount?: boolean;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
  countPosition?: 'bottom-left' | 'bottom-right' | 'top-right';
  /** Ref forwarded to the underlying textarea element */
  textAreaRef?: Ref<any>;
  /** Rendered inside the positioning wrapper, after the textarea box (useful for overlays like mention suggestions) */
  renderOverlay?: () => ReactNode;
  /** When true, renders a skeleton placeholder instead of the textarea */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

export function TextArea({
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
}: TextAreaProps) {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const theme = useTheme();
  const [charCount, setCharCount] = useState(() => (value ?? defaultValue ?? '').length);
  const [countLive, setCountLive] = useState(false);

  const internalRef = useRef<any>(null);
  const textAreaRef = textAreaRefProp ? (textAreaRefProp as RefObject<any>) : internalRef;
  const [autoHeight, setAutoHeight] = useState<number | undefined>(undefined);

  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSize, minRows || 3, hydrationTouch);
  const maxHeightPx = getFieldHeight(resolvedSize, maxRows, hydrationTouch);
  // Polaris/GOV.UK: a declared limit always surfaces a live count. Explicit
  // `showCount={false}` ejects.
  const showCharacterCount = showCount ?? maxLength != null;
  const countId = showCharacterCount && id ? `${id}-count` : undefined;

  const measureAndResize = useCallback(() => {
    if (!autoResize || !isWeb) {
      return;
    }
    const textAreaElement = textAreaRef.current as HTMLTextAreaElement | null;
    if (!textAreaElement) {
      return;
    }
    textAreaElement.style.height = 'auto';
    const clamped = Math.min(Math.max(textAreaElement.scrollHeight, minHeightPx), maxHeightPx);
    textAreaElement.style.height = `${clamped}px`;
    setAutoHeight(clamped);
  }, [autoResize, minHeightPx, maxHeightPx]);

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
      <FieldLayout {...layoutBind} error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton variant="rounded" width="100%" height={minHeightPx} {...knobProps.containerRadius} />
        </InputParts>
      </FieldLayout>
    );
  }

  const renderCount = (length: number) => {
    if (!showCharacterCount) {
      return null;
    }
    const safeLength = Math.max(0, length);
    const remaining = maxLength != null ? maxLength - safeLength : undefined;
    const isOverLimit = remaining != null && remaining < 0;
    const text = maxLength != null ? `${safeLength}/${maxLength}` : `${safeLength} characters`;
    const countLabel =
      maxLength == null
        ? `${safeLength} characters`
        : isOverLimit
          ? `${Math.abs(remaining ?? 0)} over the ${maxLength} character limit`
          : `${Math.max(0, remaining ?? 0)} remaining of ${maxLength}`;
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
          {...(countId ? { id: countId } : undefined)}
          size="$2"
          color={isOverLimit ? formCommonColors.error : formCommonColors.muted}
          aria-label={countLabel}
          aria-live={countLive ? 'polite' : 'off'}
          aria-atomic="true">
          {text}
        </Paragraph>
      </XStack>
    );
  };

  const countInside = showCharacterCount && countPosition.startsWith('bottom');

  const resizeStyle = autoResize
    ? {
        minHeight: minHeightPx,
        maxHeight: maxHeightPx,
        ...(autoHeight != null ? { height: autoHeight } : undefined),
        overflow: (autoHeight != null && autoHeight >= maxHeightPx ? 'scroll' : 'hidden') as 'scroll' | 'hidden',
      }
    : numberOfLines
      ? { numberOfLines, minHeight: getFieldHeight(resolvedSize, numberOfLines, hydrationTouch) }
      : { numberOfLines: minRows, minHeight: minHeightPx };

  const isControlled = value !== undefined;

  // Count from the live value whenever an upstream source drives the field
  // (controlled `value` prop or TanStack field state): the mount-only
  // charCount state froze counts for values applied after first paint
  // (create-mode seeding, setFieldValue). Uncontrolled standalone keeps the
  // keystroke-fed local state (its defaultValue never changes underneath).
  const countFrom = (textValue: string | undefined) =>
    isControlled || !!(resolvedForm && name) ? (textValue ?? '').length : charCount;

  const renderTextArea = (
    textValue: string | undefined,
    handleChange?: (text: string) => void,
    handleBlur?: (...args: any[]) => void,
    hasError?: boolean,
  ) => (
    <>
      {showCharacterCount && countPosition.startsWith('top') && renderCount(countFrom(textValue))}
      <YStack position="relative" width="100%">
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
            innerRef={textAreaRef}
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
            {...(isWeb
              ? {
                  // Polaris multiline: no native resize (Box clips it). Primer
                  // vertical resize is the autoResize=false fallback only when
                  // the host does not clip — we keep none so the inset ring
                  // and overflow:hidden stay intact.
                  // fontWeight is inline so it beats the size atomic in the
                  // stylesheet (RM-TXT-6); consumer style still ejects after.
                  style: {
                    resize: 'none',
                    overflowWrap: 'anywhere',
                    ...(knobProps.body.fontWeight != null ? { fontWeight: knobProps.body.fontWeight } : undefined),
                    ...(typeof (textAreaProps as { style?: object } | undefined)?.style === 'object'
                      ? (textAreaProps as { style?: object }).style
                      : undefined),
                  },
                  ...(countInside ? { paddingBottom: '$5' } : undefined),
                }
              : {
                  style: {
                    ...(knobProps.body.fontWeight != null ? { fontWeight: knobProps.body.fontWeight } : undefined),
                    ...(typeof (textAreaProps as { style?: object } | undefined)?.style === 'object'
                      ? (textAreaProps as { style?: object }).style
                      : undefined),
                  },
                  ...(countInside ? { paddingBottom: '$5' } : undefined),
                })}
            placeholderTextColor={theme.placeholderColor?.val ?? formCommonColors.muted}
            {...(maxLength != null ? { maxLength } : undefined)}
            {...(placeholder !== undefined ? { placeholder } : undefined)}
            disabled={disabled}
            readOnly={!!readOnly}
            {...(disabled ? { cursor: 'not-allowed' as const } : undefined)}
            {...(readOnly ? { 'aria-readonly': true } : undefined)}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
            aria-multiline="true"
            {...(countId ? { 'aria-describedby': countId } : undefined)}
            id={id}
            {...(isControlled ? { value: textValue } : { defaultValue: textValue })}
            onFocus={(e: any) => {
              setCountLive(true);
              (textAreaProps as { onFocus?: (ev: any) => void } | undefined)?.onFocus?.(e);
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
            onBlur={(e: any) => {
              setCountLive(false);
              handleBlur?.(e);
              (textAreaProps as { onBlur?: (ev: any) => void } | undefined)?.onBlur?.(e);
            }}
          />
        </InputParts.Box>
        {countInside && renderCount(countFrom(textValue))}
        {renderOverlay?.()}
      </YStack>
    </>
  );

  if (!resolvedForm || !name) {
    return (
      <FieldLayout {...layoutBind} error={error} onBlur={onBlur}>
        <InputParts size={resolvedSize} {...(error ? { theme: 'error' } : undefined)}>
          {renderTextArea(value ?? defaultValue, undefined, undefined, !!error)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        return (
          <FieldLayout {...layoutBind} error={resolvedError} onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <InputParts size={resolvedSize} {...(resolvedError ? { theme: 'error' } : undefined)}>
              {renderTextArea(
                field.state.value as string,
                (text) => {
                  field.handleChange(text as any);
                },
                undefined,
                !!resolvedError,
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}
