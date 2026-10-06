import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { ensureFocusVisibleRing, useAaSolidFill, useReadableTextOn, useResolvedKnobs } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ComponentRef, RefObject } from 'react';
import { Pressable as RNPressable } from 'react-native';
import { Text, View, XStack, YStack, isWeb, useProps } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { FloatingPanel, useViewportGtSm } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors, formSelectedColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { filterDrawnIcons, isDrawnIconName, parseIconOptions, resolveIconCatalog } from './drawn-icon-names';
import type { DrawnIconName } from './drawn-icon-names';
import { DrawnIcon } from './drawn-set';

export type { DrawnIconName } from './drawn-icon-names';
export {
  DRAWN_ICON_NAMES,
  filterDrawnIcons,
  isDrawnIconName,
  parseIconOptions,
  resolveIconCatalog,
} from './drawn-icon-names';
export { DrawnIcon } from './drawn-set';

export type IconProps<
  TParentData = unknown,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    /** @deprecated Use `onChange` instead. */
    onValueChange?: (value: string) => void;
    skeleton?: boolean;
    compact?: boolean;
    /** Restrict the picker to a subset of the drawn set (df.options). */
    icons?: readonly string[];
    options?: string;
  };

const adornmentRing = ensureFocusVisibleRing({ outlineOffset: -2 });
const NESTED_GLYPH_WELL = 32;
const CLEAR_ICON_LABEL = 'Clear icon';
const SEARCH_ICONS_LABEL = 'Search icons';
const DEFAULT_LABEL = 'Icon';

interface IconKeyEvent {
  key: string;
  code: string;
  preventDefault: () => void;
}

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp']);

const openOnKey = (e: IconKeyEvent, blocked: boolean, setOpen: (open: boolean) => void) => {
  if (blocked) {
    return;
  }
  if (OPEN_KEYS.has(e.key) || e.code === 'Space') {
    e.preventDefault();
    setOpen(true);
  }
};

// Tamagui's `Role` type omits listbox, so the prop rides a spread bag.
// oxlint-disable-next-line anti-slop/no-known-value-widening -- the widened bag is the point: a literal `role: 'listbox'` is rejected by Tamagui's Role type
const LISTBOX_PROPS: Record<string, string> = { role: 'listbox' };

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const EmptyGlyphWell = () => (
  <View
    testID="icon-empty-well"
    width={16}
    height={16}
    borderWidth={1}
    borderStyle="dashed"
    borderColor="$borderColor"
    borderRadius={3}
  />
);

const ReadOnlyGlyph = ({ drawn }: { drawn: DrawnIconName | undefined }) => (
  <View
    testID="icon-field-readonly"
    width={NESTED_GLYPH_WELL}
    height={NESTED_GLYPH_WELL}
    alignItems="center"
    justifyContent="center">
    {/* Outside InputParts.Icon, which is what injects a colour. */}
    {drawn ? (
      <DrawnIcon
        name={drawn}
        size={16}
        color={formCommonColors.text}
      />
    ) : (
      <EmptyGlyphWell />
    )}
  </View>
);

const TrailingAdornment = ({
  showClear,
  disabled,
  handleClear,
}: {
  showClear: boolean;
  disabled?: boolean;
  handleClear: () => void;
}) =>
  showClear && isWeb ? (
    <InputParts.Button
      data-floating-panel-action="true"
      tabIndex={0}
      aria-label={t(CLEAR_ICON_LABEL)}
      disabled={disabled}
      focusVisibleStyle={adornmentRing}
      onPress={(e) => {
        e.stopPropagation();
        handleClear();
      }}>
      <InputParts.Icon>
        <DrawnIcon
          name="x"
          size={16}
        />
      </InputParts.Icon>
    </InputParts.Button>
  ) : (
    <InputParts.Icon adornment="trailing">
      <DrawnIcon
        name="chev-d"
        size={16}
      />
    </InputParts.Icon>
  );

interface IconTriggerProps {
  drawn: DrawnIconName | undefined;
  displayValue: string;
  placeholder: string;
  open: boolean;
  disabled?: boolean;
  hasError: boolean;
  required?: boolean;
  id?: string;
  hasLabel?: boolean;
  showClear: boolean;
  inTableCell: boolean;
  sizeToken: ComponentProps<typeof InputParts>['size'];
  triggerInputRef: RefObject<ComponentRef<typeof InputParts.Area> | null>;
  suppressFocusOpenUntilRef: RefObject<number>;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  handleClear: () => void;
}

const IconTrigger = ({
  drawn,
  displayValue,
  placeholder,
  open,
  disabled,
  hasError,
  required,
  id,
  hasLabel,
  showClear,
  inTableCell,
  sizeToken,
  triggerInputRef,
  suppressFocusOpenUntilRef,
  setOpen,
  setQuery,
  handleClear,
}: IconTriggerProps) => (
  <View>
    <InputParts
      cursor="pointer"
      onPress={
        isWeb && !disabled
          ? () => {
              setOpen(true);
            }
          : undefined
      }
      size={sizeToken}>
      <InputParts.Box
        testID="icon-field"
        theme={hasError ? 'error' : undefined}
        disabled={disabled}
        {...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined)}>
        <InputParts.Icon adornment="leading">
          {drawn ? (
            <DrawnIcon
              name={drawn}
              size={16}
            />
          ) : (
            <EmptyGlyphWell />
          )}
        </InputParts.Icon>
        {!inTableCell && (
          <InputParts.Area
            ref={triggerInputRef}
            id={id}
            value={displayValue}
            placeholder={placeholder}
            fontFamily="$mono"
            readOnly={!open}
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? `${id ?? 'icon'}-listbox` : undefined}
            aria-label={hasLabel ? undefined : t(DEFAULT_LABEL)}
            aria-required={required === true ? true : undefined}
            aria-invalid={hasError ? true : undefined}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChangeText={open ? setQuery : undefined}
            onFocus={() => {
              if (!disabled && performance.now() > suppressFocusOpenUntilRef.current) {
                setOpen(true);
              }
            }}
            onKeyDown={(e: IconKeyEvent) => {
              openOnKey(e, open || disabled === true, setOpen);
            }}
          />
        )}
        <TrailingAdornment
          showClear={showClear}
          disabled={disabled}
          handleClear={handleClear}
        />
      </InputParts.Box>
    </InputParts>
  </View>
);

interface IconOptionProps {
  name: DrawnIconName;
  selected: boolean;
  markFill: string;
  onMark: string | undefined;
  onPick: (name: DrawnIconName) => void;
}

const IconOption = ({ name, selected, markFill, onMark, onPick }: IconOptionProps) => {
  const cellInk = selected && onMark !== undefined && onMark !== '' ? onMark : formCommonColors.text;
  const cell = (
    <View
      key={name}
      {...(isWeb ? { role: 'option', 'aria-selected': selected } : { pointerEvents: 'none' as const })}
      testID={`icon-option-${name}`}
      width={64}
      padding="$1"
      cursor="pointer"
      onPress={
        isWeb
          ? () => {
              onPick(name);
            }
          : undefined
      }>
      <YStack
        height={60}
        alignItems="center"
        justifyContent="center"
        gap="$1"
        borderRadius="$3"
        // The selected mark is the active
        // accent, never a neutral ramp step.
        backgroundColor={selected ? markFill : 'transparent'}
        hoverStyle={selected ? undefined : { backgroundColor: '$color3' }}>
        {/* Outside InputParts.Icon, so the colour is passed here. */}
        <DrawnIcon
          name={name}
          size={16}
          color={cellInk}
        />
        <Text
          fontFamily="$mono"
          fontSize={11}
          // $color10 measures 3.95-4.36:1, under the 4.5:1 AA floor
          // colorRamps.ts records; step 11 is the lowest that passes.
          color={cellInk}
          numberOfLines={1}>
          {name}
        </Text>
      </YStack>
    </View>
  );
  if (isWeb) {
    return cell;
  }
  return (
    <RNPressable
      onPress={() => {
        onPick(name);
      }}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}>
      {cell}
    </RNPressable>
  );
};

interface IconPanelProps {
  id?: string;
  matches: readonly DrawnIconName[];
  query: string;
  value: string;
  markFill: string;
  onMark: string | undefined;
  onPick: (name: DrawnIconName) => void;
}

const IconPanel = ({ id, matches, query, value, markFill, onMark, onPick }: IconPanelProps) => (
  <YStack
    testID="icon-panel"
    id={`${id ?? 'icon'}-listbox`}
    {...LISTBOX_PROPS}
    aria-label={t('Icons')}>
    {matches.length === 0 ? (
      <Text
        testID="icon-no-results"
        color={formCommonColors.muted}
        fontSize="$3"
        textAlign="center"
        padding="$4">
        {t('No icon matches "{{query}}"', { query })}
      </Text>
    ) : (
      <XStack flexWrap="wrap">
        {matches.map((name) => (
          <IconOption
            key={name}
            name={name}
            selected={name === value}
            markFill={markFill}
            onMark={onMark}
            onPick={onPick}
          />
        ))}
      </XStack>
    )}
  </YStack>
);

const IconControl = ({
  value,
  placeholder,
  disabled,
  readOnly,
  hasError,
  required,
  id,
  hasLabel,
  a11yLabel,
  helperText,
  catalog,
  onValueChange,
  onBlurControl,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  hasError: boolean;
  required?: boolean;
  id?: string;
  hasLabel?: boolean;
  a11yLabel?: string;
  helperText?: string;
  catalog: readonly DrawnIconName[];
  onValueChange: (value: string) => void;
  onBlurControl?: () => void;
}) => {
  const inTableCell = useIsInTableCell();
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const suppressFocusOpenUntilRef = useRef(0);
  const triggerInputRef = useRef<ComponentRef<typeof InputParts.Area>>(null);
  const viewportGtSm = useViewportGtSm();
  const shouldUseSheet = !isWeb || !(typeof window !== 'undefined' && viewportGtSm);
  const drawn = isDrawnIconName(value) ? value : undefined;
  const matches = useMemo(() => filterDrawnIcons(catalog, query), [catalog, query]);
  // Ink that reads on the accent fill the selected cell carries.
  const markFill = useAaSolidFill(formSelectedColors.mark);
  const onMark = useReadableTextOn(markFill);

  const closePanel = useCallback(() => {
    // Focus restoration retries after 320ms in focusManagement.ts. Let that
    // focus return without reopening; explicit pointer/key actions still open.
    suppressFocusOpenUntilRef.current = performance.now() + 450;
    setOpen(false);
    setQuery('');
    onBlurControl?.();
  }, [onBlurControl]);

  const handlePick = useCallback(
    (name: DrawnIconName) => {
      onValueChange(name);
      closePanel();
      // Pointer capture can open before the trigger gets focus, leaving the
      // shared restore target on body. A completed pick returns to its input.
      // Other dismissals keep the user's chosen destination; native stays inert.
      if (isWeb) {
        triggerInputRef.current?.focus();
      }
    },
    [closePanel, onValueChange],
  );

  const handleClear = useCallback(() => {
    onValueChange('');
    setQuery('');
  }, [onValueChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (disabled || readOnly) {
        return;
      }
      if (next) {
        setOpen(true);
        return;
      }
      closePanel();
    },
    [closePanel, disabled, readOnly],
  );

  if (readOnly) {
    return <ReadOnlyGlyph drawn={drawn} />;
  }

  const displayValue = open ? query : (drawn ?? value);
  const showClear = Boolean(value) && !disabled;

  const trigger = (
    <IconTrigger
      drawn={drawn}
      displayValue={displayValue}
      placeholder={placeholder}
      open={open}
      disabled={disabled}
      hasError={hasError}
      required={required}
      id={id}
      hasLabel={hasLabel}
      showClear={showClear}
      inTableCell={inTableCell}
      sizeToken={knobProps.sizeToken}
      triggerInputRef={triggerInputRef}
      suppressFocusOpenUntilRef={suppressFocusOpenUntilRef}
      setOpen={setOpen}
      setQuery={setQuery}
      handleClear={handleClear}
    />
  );

  const sheetSearchHeader = shouldUseSheet ? (
    <InputParts size={knobProps.sizeToken}>
      <InputParts.Box>
        <InputParts.Icon adornment="leading">
          <MagnifyingGlassIcon size={16} />
        </InputParts.Icon>
        <InputParts.Area
          testID="icon-sheet-search"
          value={query}
          placeholder={t(SEARCH_ICONS_LABEL)}
          accessibilityLabel={t(SEARCH_ICONS_LABEL)}
          aria-label={t(SEARCH_ICONS_LABEL)}
          fontFamily="$mono"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onChangeText={setQuery}
        />
      </InputParts.Box>
    </InputParts>
  ) : undefined;
  const nativeClear =
    !isWeb && showClear ? (
      <InputParts.Button
        testID="icon-clear-native"
        aria-label={t(CLEAR_ICON_LABEL)}
        accessibilityLabel={t(CLEAR_ICON_LABEL)}
        disabled={disabled}
        onPress={(e) => {
          e.stopPropagation();
          handleClear();
        }}>
        <InputParts.Icon>
          <DrawnIcon
            name="x"
            size={16}
          />
        </InputParts.Icon>
      </InputParts.Button>
    ) : undefined;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      triggerEnd={nativeClear}
      header={sheetSearchHeader}
      disabled={disabled}
      scrollable
      sizing="fill"
      widthMode="match-trigger"
      triggerA11y={{
        label: a11yLabel === undefined || a11yLabel === '' ? t(DEFAULT_LABEL) : a11yLabel,
        value: value === '' ? placeholder : value,
        hint: helperText,
      }}>
      <IconPanel
        id={id}
        matches={matches}
        query={query}
        value={value}
        markFill={markFill}
        onMark={onMark}
        onPick={handlePick}
      />
    </FloatingPanel>
  );
};

export const Icon = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: IconProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
  const {
    defaultValue,
    form,
    placeholder = t('Choose an icon'),
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    onBlur,
    value: controlledValue,
    onChange,
    // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias must keep firing until it is removed
    onValueChange,
    skeleton,
    compact,
    id: idProp,
    icons,
    options,
  } = useProps(props);

  const catalog = useMemo(() => resolveIconCatalog(icons ?? parseIconOptions(options)), [icons, options]);

  const emitValueChange = useCallback(
    (newValue: string) => {
      onChange?.(newValue);
      onValueChange?.(newValue);
    },
    [onChange, onValueChange],
  );

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [standaloneValue, setStandaloneValue] = useState<string>(() => controlledValue ?? String(defaultValue ?? ''));

  useEffect(() => {
    if (controlledValue !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- keeps the uncontrolled fallback in step with the last controlled value
      setStandaloneValue(controlledValue);
    }
  }, [controlledValue]);

  const handleStandaloneChange = useCallback(
    (newValue: string) => {
      setStandaloneValue(newValue);
      emitValueChange(newValue);
    },
    [emitValueChange],
  );

  const hasLabel = Boolean(label);

  if (skeleton) {
    return (
      <InputParts size={size === undefined || size === '' || size === 0 ? knobProps.sizeToken : size}>
        {hasLabel ? (
          <Skeleton
            variant="text"
            width={96}
            height={14}
          />
        ) : null}
        <Skeleton
          variant="rounded"
          width={320}
          height={knobProps.control.height}
          borderRadius={knobProps.borderRadius.borderRadius}
        />
      </InputParts>
    );
  }

  const control = (fieldValue: string, onValue: (next: string) => void, error?: string | boolean) => (
    <IconControl
      value={fieldValue}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      hasError={hasErrorValue(error)}
      required={required}
      id={id}
      hasLabel={hasLabel}
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is ReactNode; only a string can serve as the a11y label
      a11yLabel={typeof label === 'string' ? label : undefined}
      helperText={helperText}
      catalog={catalog}
      onValueChange={onValue}
      onBlurControl={() => onBlur?.()}
    />
  );

  if (resolvedForm == null || name === undefined || name === '') {
    const effectiveValue = controlledValue ?? standaloneValue;
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        {control(effectiveValue, handleStandaloneChange, errorProp)}
      </FieldLayout>
    );
  }

  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, errorProp);
        const fieldValue = String(field.state.value ?? '');
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            disabled={disabled}>
            {control(
              fieldValue,
              (newValue) => {
                // SAFETY: this field only ever stores the icon-name string, so TData is string here.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TData is a deferred generic; the picker only emits strings
                field.handleChange(newValue as TData);
                emitValueChange(newValue);
              },
              resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
