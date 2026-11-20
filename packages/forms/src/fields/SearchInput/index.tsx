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
import {
  useTouchSurface,
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  pressTargetHitSlop,
  sizeRecipeForToken,
} from '@repo/theme';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { View, isWeb } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/color-ramps';
import { bidiIsolate, t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

type AreaProps = ComponentProps<typeof InputParts.Area>;

export interface SearchInputProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
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

/** Data attribute carried as a spread: object-literal `data-*` keys fail excess-property checks. */
const T_VALUE_ATTRS = { 'data-mp-t-value': 'full' } as const;

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

const ensureSearchInputChrome = () => {
  if (typeof document === 'undefined') {
    return;
  }
  ensureCompositeFocusRing();
  if (document.querySelector(`#${SEARCH_STYLE_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = SEARCH_STYLE_ID;
  tag.textContent = searchInputCss;
  document.head.append(tag);
};

const focusArea = (ref: RefObject<TamaguiElement | null>) => {
  ref.current?.focus();
};

interface ClearButtonProps {
  visualHeight: number;
  belowFloor: boolean;
  iconSize: number;
  onClear: () => void;
}

const ClearButton = ({ visualHeight, belowFloor, iconSize, onClear }: ClearButtonProps) => (
  <View
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- hand-rolled View: TButton swallows className, so the chip-dismiss ring classes cannot ride a button (see header)
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
    onPress={onClear}
    onKeyDown={(e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClear();
      }
    }}>
    <View
      className={isWeb ? 'mp-chip-dismiss-ring' : undefined}
      alignItems="center"
      justifyContent="center"
      hoverStyle={{ backgroundColor: '$color4' }}
      pressStyle={{ backgroundColor: '$color5' }}>
      <InputParts.Icon
        aria-hidden
        color={formCommonColors.muted}>
        <XIcon size={iconSize} />
      </InputParts.Icon>
    </View>
  </View>
);

/** Debounced `onSearch`: `scheduleSearch` waits `debounceMs` of silence, `fireSearch` runs now. */
const useDebouncedSearch = (onSearch: ((text: string) => void) | undefined, debounceMs: number) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const fireSearch = useCallback((next: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = null;
    onSearchRef.current?.(next);
  }, []);

  const scheduleSearch = useCallback(
    (next: string) => {
      if (debounceMs <= 0) {
        fireSearch(next);
        return;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        fireSearch(next);
      }, debounceMs);
    },
    [debounceMs, fireSearch],
  );

  return { fireSearch, scheduleSearch };
};

export const SearchInput = ({
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
}: SearchInputProps) => {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, control, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const resolvedSize = size ?? knobProps.sizeToken;
  const recipe = sizeRecipeForToken(String(resolvedSize), { touch: hydrationTouch });
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);
  const belowFloor = visualHeight < MIN_PRESS_TARGET;
  const isControlled = value !== undefined;
  const [internalText, setInternalText] = useState(defaultValue ?? '');
  const standaloneText = isControlled ? value : internalText;
  const inputRef = useRef<TamaguiElement>(null);

  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  });
  const { fireSearch, scheduleSearch } = useDebouncedSearch(onSearch, debounceMs);

  if (isWeb) {
    ensureSearchInputChrome();
  }

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

  const hasLabel = Boolean(label);
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

  const renderBox = (current: string, fieldChange?: (text: string) => void, hasError = false) => {
    const showClear = Boolean(clearable && !disabled && !readOnly && current);
    const areaProps: AreaProps = {
      id,
      role: 'searchbox',
      'aria-label': hasLabel ? undefined : (ariaLabel ?? t('Search')),
      'aria-invalid': hasError ? true : undefined,
      'aria-required': required === true ? true : undefined,
      'aria-readonly': readOnly === true ? true : undefined,
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
      ...T_VALUE_ATTRS,
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
      onKeyDown: (e: ReactKeyboardEvent) => {
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
    };

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
          <ClearButton
            visualHeight={visualHeight}
            belowFloor={belowFloor}
            iconSize={resolvedIconSize}
            onClear={() => {
              clearText(fieldChange);
            }}
          />
        ) : null}
      </InputParts.Box>
    );
  };

  if (skeleton) {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={visualHeight}
          />
        </InputParts>
      </FieldLayout>
    );
  }

  if (resolvedForm == null || name === undefined || name === '') {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}
        onBlur={onBlur}>
        <InputParts size={resolvedSize}>{renderBox(standaloneText, undefined, Boolean(error))}</InputParts>
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
        const hasResolvedError = Boolean(resolvedError);
        return (
          <FieldLayout
            {...layoutBind}
            error={resolvedError}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <InputParts
              size={resolvedSize}
              {...(hasResolvedError ? { theme: 'error' } : undefined)}>
              {renderBox(
                field.state.value ?? '',
                (next) => {
                  field.handleChange(next);
                },
                hasResolvedError,
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};
