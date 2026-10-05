/**
 * SearchInput — the ONE search box.
 *
 * Anatomy (Polaris / Primer / Linear / Spotlight):
 * one painted box around muted magnifier + field + clear. The inner
 * native field never rings. Magnifier is not a tab stop. Clear ✕ is the
 * second focusable and rings its own glyph (chip-dismiss).
 *
 * Clear is a View sized from the size-recipe square (same geometry as
 * Input.Button). It was hand-rolled because TButton swallows className, so
 * the chip-dismiss ring classes could not ride Input.Button. `glyphRing`
 * now exists (InputParts/index.tsx) and renders this exact pair, so
 * this block can collapse onto `<Input.Button glyphRing>` — in SearchInput's
 * own lane, not this one.
 */
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import { MIN_PRESS_TARGET, ensureCompositeFocusRing, pressTargetHitSlop, sizeRecipeForToken } from '@repo/theme';
import type { ComponentProps, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { View, isWeb } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/colorRamps';
import { bidiIsolate, t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

type AreaProps = ComponentProps<typeof InputParts.Area>;

export interface SearchInputProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  /** Controlled value. Omit for uncontrolled use with defaultValue. */
  value?: string;
  defaultValue?: string;
  /** Fires on every keystroke (and on clear) with the raw text. */
  onChange?: (text: string) => void;
  /** Fires after debounceMs of typing silence; immediately on clear/Enter. */
  onSearch?: (text: string) => void;
  /** Fires when the clear affordance or Escape empties the box. */
  onClear?: () => void;
  onBlur?: (...args: unknown[]) => void;
  /** Debounce for onSearch in ms. 0 fires synchronously. */
  debounceMs?: number;
  placeholder?: string;
  /** Show the clear (X) button when there is text. Escape always clears. */
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  helperText?: string;
  error?: string | boolean;
  size?: SizeTokens;
  /** Compact density (toolbar embedding). Orthogonal to `size`. */
  compact?: boolean;
  /** Borderless/background-less (flush toolbar bands). */
  chromeless?: boolean;
  skeleton?: boolean;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  id?: string;
  'aria-label'?: string;
  /** Leading icon size in px. Defaults from the size token. */
  iconSize?: number;
  inputProps?: Omit<AreaProps, 'value' | 'id' | 'onChange' | 'onChangeText'>;
}

const SEARCH_STYLE_ID = 'mp-search-input-chrome';

/** UA search chrome only. Glyph ring is the shared chip-dismiss recipe. */
const searchInputCss = `input.mp-search-input {
  -webkit-appearance: none;
  appearance: none;
}
input.mp-search-input::-webkit-search-cancel-button,
input.mp-search-input::-webkit-search-decoration,
input.mp-search-input::-webkit-search-results-button,
input.mp-search-input::-webkit-search-results-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
input.mp-search-input:focus,
input.mp-search-input:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}`;

function ensureSearchInputChrome() {
  if (typeof document === 'undefined') {
    return;
  }
  ensureCompositeFocusRing();
  if (document.getElementById(SEARCH_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = SEARCH_STYLE_ID;
  tag.textContent = searchInputCss;
  document.head.appendChild(tag);
}

function focusArea(ref: RefObject<TamaguiElement | null>) {
  (ref.current as { focus?: () => void } | null)?.focus?.();
}

export function SearchInput({
  name,
  form: formProp,
  validators,
  value,
  defaultValue,
  onChange,
  onSearch,
  onClear,
  onBlur,
  debounceMs = 300,
  // Bidi-isolated at the interpolation site: under RTL the trailing
  // weak "..." otherwise reorders to the start ("…Search"). First-strong
  // isolation keeps a translated RTL placeholder rendering RTL. Consumer
  // placeholders are the consumer's interpolation site — passed through.
  placeholder = bidiIsolate(t('Search...')),
  clearable = true,
  disabled,
  readOnly,
  required,
  helperText,
  error,
  size,
  compact,
  chromeless,
  skeleton,
  label,
  labelProps,
  id: idProp,
  'aria-label': ariaLabel,
  iconSize,
  inputProps,
}: SearchInputProps) {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, control, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const recipe = sizeRecipeForToken(String(resolvedSize), { touch: hydrationTouch });
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);
  const belowFloor = visualHeight < MIN_PRESS_TARGET;
  const isControlled = value !== undefined;
  const [internalText, setInternalText] = useState(defaultValue ?? '');
  const standaloneText = isControlled ? value : internalText;
  const inputRef = useRef<TamaguiElement>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  if (isWeb) {
    ensureSearchInputChrome();
  }

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const fireSearch = useCallback((next: string) => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = undefined;
    onSearchRef.current?.(next);
  }, []);

  const scheduleSearch = useCallback(
    (next: string) => {
      if (debounceMs <= 0) {
        fireSearch(next);
        return;
      }
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        fireSearch(next);
      }, debounceMs);
    },
    [debounceMs, fireSearch],
  );

  const writeText = useCallback(
    (next: string, fieldChange?: (text: string) => void) => {
      if (!isControlled && !fieldChange) {
        setInternalText(next);
      }
      fieldChange?.(next);
      onChange?.(next);
      scheduleSearch(next);
    },
    [isControlled, onChange, scheduleSearch],
  );

  const clearText = useCallback(
    (fieldChange?: (text: string) => void) => {
      if (!isControlled && !fieldChange) {
        setInternalText('');
      }
      fieldChange?.('');
      onChange?.('');
      fireSearch('');
      onClearRef.current?.();
      // Polaris / Spotlight: emptying via ✕ keeps the caret in the field.
      // Do this before the button unmounts so focus does not drop to body.
      focusArea(inputRef);
    },
    [isControlled, onChange, fireSearch],
  );

  const resolvedIconSize = iconSize ?? recipe.iconSize;
  const boxContract = {
    size: resolvedSize,
    'data-density': knobProps.density,
    'data-size': String(resolvedSize),
    'data-visual-height': String(visualHeight),
    'data-press-floor': belowFloor ? 'slop' : 'box',
    'data-ring-target': 'box',
    ...(belowFloor ? { hitSlop: pressTargetHitSlop(visualHeight) } : undefined),
  } as const;

  const chromelessProps = chromeless
    ? {
        borderWidth: 0,
        backgroundColor: 'transparent' as const,
        hoverStyle: {
          borderColor: 'transparent' as const,
          ...control.hoverKnobProps,
        },
        focusStyle: {
          borderColor: 'transparent' as const,
          ...control.focusKnobProps,
        },
      }
    : undefined;

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
    'aria-label': ariaLabel,
  };

  const leadingWebProps = isWeb
    ? {
        tabIndex: -1 as const,
        'aria-hidden': true,
        onMouseDown: (e: { preventDefault?: () => void }) => {
          e.preventDefault?.();
          if (!disabled && !readOnly) {
            focusArea(inputRef);
          }
        },
      }
    : {
        focusable: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
        onPress: () => {
          if (!disabled && !readOnly) {
            focusArea(inputRef);
          }
        },
      };

  const renderBox = (current: string, fieldChange?: (text: string) => void, hasError?: boolean) => {
    const showClear = Boolean(clearable && !disabled && !readOnly && current);
    const areaProps = {
      id,
      role: 'searchbox',
      'aria-label': label ? undefined : (ariaLabel ?? t('Search')),
      'aria-invalid': hasError || undefined,
      'aria-required': required || undefined,
      'aria-readonly': readOnly || undefined,
      type: 'search',
      autoComplete: 'off',
      spellCheck: false,
      inputMode: 'search',
      enterKeyHint: 'search',
      value: current,
      disabled,
      readOnly,
      placeholder,
      // T-VALUE (knob-laws § textAccent › entered text): full ramp, never
      // dimmed. InputParts.Area still defaults to textAccentColor — override
      // here so SearchInput does not wait on that shared default. Consumer
      // inputProps still eject last.
      color: '$color',
      'data-mp-t-value': 'full',
      paddingInlineStart: 0,
      paddingInlineEnd: showClear ? 0 : undefined,
      className: isWeb ? 'mp-input-area mp-search-input' : undefined,
      outlineWidth: 0,
      outlineStyle: 'none' as const,
      outlineColor: 'transparent',
      focusStyle: {
        outlineWidth: 0,
        outlineStyle: 'none' as const,
        outlineColor: 'transparent',
      },
      focusVisibleStyle: {
        outlineWidth: 0,
        outlineStyle: 'none' as const,
        outlineColor: 'transparent',
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (!current) {
            return;
          }
          e.preventDefault();
          clearText(fieldChange);
        } else if (e.key === 'Enter') {
          fireSearch(current);
        }
      },
      onSubmitEditing: () => {
        fireSearch(current);
      },
      ...inputProps,
    } as unknown as AreaProps;

    return (
      <InputParts.Box
        {...boxContract}
        disabled={disabled}
        {...chromelessProps}
        {...(hasError ? { theme: 'error' } : undefined)}>
        <InputParts.Icon
          adornment="leading"
          color={formCommonColors.muted}
          className={isWeb ? 'mp-search-leading' : undefined}
          {...leadingWebProps}>
          <MagnifyingGlassIcon size={resolvedIconSize} />
        </InputParts.Icon>
        <InputParts.Area
          ref={inputRef}
          {...areaProps}
          onChangeText={(next: string) => {
            writeText(next, fieldChange);
          }}
        />
        {showClear ? (
          <View
            role="button"
            tabIndex={0}
            aria-label={t('Clear search')}
            className={isWeb ? 'mp-chip-dismiss' : undefined}
            data-end-cap={visualHeight}
            width={visualHeight}
            height={visualHeight}
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            outlineWidth={0}
            focusStyle={{ outlineWidth: 0 }}
            focusVisibleStyle={{ outlineWidth: 0 }}
            flexShrink={0}
            hitSlop={belowFloor ? pressTargetHitSlop(visualHeight) : undefined}
            onPress={() => {
              clearText(fieldChange);
            }}
            onKeyDown={
              ((e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  clearText(fieldChange);
                }
              }) as unknown as () => void
            }>
            <View
              className={isWeb ? 'mp-chip-dismiss-ring' : undefined}
              alignItems="center"
              justifyContent="center"
              hoverStyle={{ backgroundColor: '$color4' }}
              pressStyle={{ backgroundColor: '$color5' }}>
              <InputParts.Icon aria-hidden color={formCommonColors.muted}>
                <XIcon size={resolvedIconSize} />
              </InputParts.Icon>
            </View>
          </View>
        ) : null}
      </InputParts.Box>
    );
  };

  if (skeleton) {
    return (
      <FieldLayout {...layoutBind} error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton variant="rounded" width="100%" height={visualHeight} />
        </InputParts>
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
    return (
      <FieldLayout {...layoutBind} error={error} onBlur={onBlur}>
        <InputParts size={resolvedSize}>{renderBox(standaloneText, undefined, !!error)}</InputParts>
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
              {renderBox(
                String(field.state.value ?? ''),
                (next) => {
                  field.handleChange(next as never);
                },
                !!resolvedError,
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}
