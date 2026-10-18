/**
 * DataTableCell - renders the appropriate field component based on column fieldType.
 *
 * Every cell in DataTable is a field. The fieldType determines which input renders.
 * When readOnly is true, the field component is rendered in read-only mode.
 *
 * All field types render their actual form component from @repo/forms
 * in standalone mode using value/onValueChange (no form.Field binding).
 */

import { StarIcon } from '@phosphor-icons/react';
import {
  // Basic inputs
  Checkbox,
  Switch,
  Select,
  Combobox,
  Input,
  TextArea,
  Slider,
  Progress,
  // Selection components
  RadioGroup,
  ToggleGroup,
  // Date/Time components
  DatePicker,
  DatetimePicker,
  TimePicker,
  DateRangePicker,
  MultiDatePicker,
  // Numeric/special inputs
  Stepper,
  Duration,
  PhoneInput,
  Barcode,
  BarcodePreview,
  MentionInput,
  OTPInput,
  // Visual/feedback
  Rating,
  // File/media
  FileUpload,
  ImageField,
  Signature,
  Geolocation,
  // Special
  ColorPicker,
  // Read-only display variants
  FieldDisplay,
  containsAcrossPanels,
} from '@repo/forms';
import { RichTextEditor } from '@repo/rich-text';
import { useResolvedKnobs, ensureCompositeFocusRing } from '@repo/theme';
import { Text } from '@repo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { View, isWeb } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableData, DataTableFieldProps, DataTableField } from '../../types';
import { alignToFlex, getDefaultColumnAlign } from '../../utils/column-align';
import { formatMoney } from '../../utils/money';

import { CellModalEditor } from './CellModalEditor';
import { CellOptionsEditor } from './CellOptionsEditor';

export interface DataTableCellProps {
  /** Current cell value */
  value: unknown;
  /** Field type - determines which input renders. Defaults to "input" */
  field?: DataTableField;
  /** Props to pass to the field component */
  fieldProps?: DataTableFieldProps;
  /** Callback when value changes */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- public callback; the committed value's type is set by the column's field type
  onChange: (value: unknown) => void;
  /** Read-only mode - field is visible but not editable */
  readOnly?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Column ID for accessibility */
  columnId: string;
  /**
   * Human-readable column header text. Chromeless in-cell fields have no
   * field label, so sheet/popover triggers (select, combobox) use this as
   * their accessible name instead of the technical columnId.
   */
  columnLabel?: string;
  /** Row index for accessibility */
  rowIndex: number;
  /** Row data for custom render */
  rowData?: DataTableData;
  /** Size token for field sizing */
  size?: string;
  /** Use compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /**
   * For linked daterange columns: the value of the linked (end date) column.
   * When set, renders a DateRangePicker with this cell as "from" and linkedValue as "to".
   */
  linkedValue?: unknown;
  /**
   * For linked daterange columns: callback to update the linked (end date) column.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- public callback; the linked column's value type is set by its field type
  onLinkedChange?: (value: unknown) => void;
}

/**
 * The pass-through field props the cell itself reads (accessible names,
 * inner-element props, icon/size overrides), typed from the field components
 * they are forwarded to. Everything else in `fieldProps` is spread as-is.
 */
interface CellFieldProps extends DataTableFieldProps {
  'aria-label'?: string;
  checkboxProps?: ComponentProps<typeof Checkbox>['checkboxProps'];
  switchProps?: ComponentProps<typeof Switch>['switchProps'];
  inputProps?: ComponentProps<typeof Stepper>['inputProps'];
  progressProps?: ComponentProps<typeof Progress>['progressProps'];
  starIcon?: ComponentProps<typeof Rating>['starIcon'];
  barcodeIcon?: ComponentProps<typeof Barcode>['barcodeIcon'];
  scanIcon?: ComponentProps<typeof Barcode>['scanIcon'];
  stopIcon?: ComponentProps<typeof Barcode>['stopIcon'];
  accept?: ComponentProps<typeof FileUpload>['accept'];
  width?: ComponentProps<typeof Signature>['width'];
  height?: ComponentProps<typeof Signature>['height'];
  clearIcon?: ComponentProps<typeof Signature>['clearIcon'];
  locationIcon?: ComponentProps<typeof Geolocation>['locationIcon'];
  expandIcon?: ComponentProps<typeof Geolocation>['expandIcon'];
  renderMap?: ComponentProps<typeof Geolocation>['renderMap'];
  minHeight?: number;
  textAreaProps?: ComponentProps<typeof TextArea>['textAreaProps'];
}

type InputInnerProps = ComponentProps<typeof Input>['inputProps'];

interface InlineTextRestProps extends DataTableFieldProps {
  inputProps?: InputInnerProps;
}

type DateValue = ComponentProps<typeof DatePicker>['value'];
type DateRangeValue = ComponentProps<typeof DateRangePicker>['value'];
type MultiDateValue = ComponentProps<typeof MultiDatePicker>['value'];
type ToggleValue = ComponentProps<typeof ToggleGroup>['value'];
type ImageValue = ComponentProps<typeof ImageField>['value'];

const FLEX_START = 'flex-start';

const EMPTY_FIELD_PROPS: DataTableFieldProps = {};

/**
 * Hands a row value to a field editor typed as that editor's value. A
 * column's `field` declares the shape of its row values; the cell trusts that
 * contract (FieldDisplay owns lenient display of malformed values).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, typescript/no-unnecessary-type-parameters -- the single trust boundary between untyped row data and each editor's value type
const asFieldValue = <T,>(value: unknown): T =>
  // SAFETY: row data is untyped at this boundary; the column's declared field type is the value contract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- no parse boundary exists for arbitrary row data; the column's field type is the contract
  value as T;

/** Text form of a cell value: null/undefined read as empty. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, typescript/no-base-to-string -- coercion boundary for arbitrary row values; text-entry editors render whatever the row holds as text
const toCellText = (value: unknown): string => (value == null ? '' : String(value));

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parse boundary: Geolocation row values are serialized text or a coordinates object
const toGeolocationText = (value: unknown): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Geolocation accepts serialized text or a coordinates object; this picks the serialization
  if (typeof value === 'string') {
    return value;
  }
  const hasValue = Boolean(value);
  return hasValue ? JSON.stringify(value) : '';
};

// ─── Internal helpers ─────────────────────────────────────────

// Rating renders 24px stars (~160px for 5 incl gaps) which overlap neighbor
// columns at typical ~130px cell widths. 16px stars fit.
const CellStar = (props: { size: number; weight: 'fill' | 'regular'; color: string }) => (
  <StarIcon
    {...props}
    size={16}
  />
);

/**
 * Draft-until-commit wrapper for the inline single-line text editor.
 * Typing edits a local draft; Enter or blur commits it via onCommit;
 * Escape restores the pre-edit value without committing. Multiline text
 * is LC-06 oversized and routes through ModalCell instead.
 */
const InlineTextEditor = ({
  value,
  onCommit,
  placeholder,
  disabled,
  readOnly,
  sizeToken,
  ariaLabel,
  restProps,
}: {
  value: unknown;
  onCommit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  sizeToken?: string;
  /** Accessible name for the chromeless in-cell editor (column header). */
  ariaLabel?: string;
  restProps: InlineTextRestProps;
}) => {
  const committed = toCellText(value);
  const [draft, setDraft] = useState(committed);
  const [prevCommitted, setPrevCommitted] = useState(committed);
  // The Input field is uncontrolled (value maps to defaultValue), so Escape
  // has to remount it to push the reverted draft back into the DOM.
  const [resetKey, setResetKey] = useState(0);
  const draftRef = useRef(draft);
  // oxlint-disable-next-line react/refs -- latest-value ref: Enter/blur handlers must read the current draft synchronously
  draftRef.current = draft;
  const committedRef = useRef(committed);
  // oxlint-disable-next-line react/refs -- latest-value ref: Enter/blur handlers must read the current committed value synchronously
  committedRef.current = committed;

  // External value updates (row edits, story controls) reset the draft.
  if (prevCommitted !== committed) {
    setPrevCommitted(committed);
    setDraft(committed);
  }

  const commit = useCallback(() => {
    if (draftRef.current !== committedRef.current) {
      // Optimistically mark the draft committed so the paired web keydown +
      // native keypress handlers don't double-fire onCommit for one Enter.
      committedRef.current = draftRef.current;
      onCommit(draftRef.current);
    }
  }, [onCommit]);

  const cancel = useCallback(() => {
    if (draftRef.current === committedRef.current) {
      return;
    }
    setDraft(committedRef.current);
    setResetKey((key) => key + 1);
  }, []);

  const handleKeyPress = useCallback(
    (event: { key?: string; nativeEvent?: { key?: string } } | undefined) => {
      const key = event?.nativeEvent?.key ?? event?.key;
      if (key === 'Escape') {
        cancel();
      } else if (key === 'Enter') {
        commit();
      }
    },
    [cancel, commit],
  );

  const { inputProps: userInputProps, ...fieldRest } = restProps;

  return (
    <Input
      key={resetKey}
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      size={sizeToken}
      {...fieldRest}
      inputProps={{
        ...(ariaLabel === undefined ? undefined : { 'aria-label': ariaLabel }),
        ...userInputProps,
        // Native fires onKeyPress; the DOM keypress event never fires for
        // Escape, so web needs onKeyDown to see it.
        onKeyPress: handleKeyPress,
        onKeyDown: handleKeyPress,
        onBlur: commit,
      }}
    />
  );
};

/**
 * Draft-until-commit wrapper for multi-step / free-entry picker editors
 * (Stepper, PhoneInput, OTP, MultiDatePicker). The wrapped field
 * edits a local draft; the draft only reaches the table's commit when the
 * user confirms — Enter inside a text input, or focus leaving the cell
 * (which includes dismissing a picker popover by clicking elsewhere).
 * Escape discards the draft and remounts the field so uncontrolled editors
 * (Stepper, PhoneInput) and popover-internal state reset to the committed
 * value.
 *
 * mode="change" (DateRangePicker) passes changes straight through to the
 * table — that picker only emits complete ranges, which are themselves the
 * confirm gesture — but keeps Escape-remount so a half-picked range (start
 * chosen, end pending) is discarded instead of lingering in the trigger.
 *
 * The picker popovers/panels render inline (CSS position:fixed, no React
 * portal), so their key and focus events bubble through this wrapper.
 * Native has no Escape/focus-out vocabulary; changes pass straight through
 * (previous behavior).
 */
const DraftFieldEditor = <T,>({
  committed,
  onCommit,
  mode = 'confirm',
  children,
}: {
  committed: T;
  onCommit: (value: T) => void;
  mode?: 'confirm' | 'change';
  children: (value: T, onChange: (value: T) => void) => ReactNode;
}) => {
  const [draft, setDraft] = useState<{ value: T } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [prevCommitted, setPrevCommitted] = useState(committed);
  // An interaction "session" starts on pointer-down inside the cell (or on
  // the first draft change) and installs document-level listeners: Escape
  // cancels, pointer-down outside the cell subtree commits. This is needed
  // because picker popovers close via floating-ui's own document Escape
  // listener while focus sits on document.body (day buttons aren't focus
  // targets), so React-tree keydown/blur handlers alone never see those
  // gestures.
  const [sessionActive, setSessionActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef(draft);
  // oxlint-disable-next-line react/refs -- latest-value ref: document listeners and the blur timer read the current draft synchronously
  draftRef.current = draft;
  const committedRef = useRef(committed);
  // oxlint-disable-next-line react/refs -- latest-value ref: commitDraft compares against the current committed value synchronously
  committedRef.current = committed;
  const onCommitRef = useRef(onCommit);
  // oxlint-disable-next-line react/refs -- latest-callback ref: keeps commit handlers stable while calling the current onCommit
  onCommitRef.current = onCommit;
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef = useRef(committed);

  // External value updates (a commit landing, row edits) clear the draft so
  // the field tracks the new committed value. A value the field did not emit
  // itself also remounts it: Stepper and PhoneInput only read defaultValue on
  // mount, and the grid keeps its cells mounted across row commits (MPO-475).
  if (!Object.is(prevCommitted, committed)) {
    setPrevCommitted(committed);
    if (draft) {
      setDraft(null);
    }
    // oxlint-disable-next-line react/refs -- render-phase prop adjustment: remount only for values the field did not emit itself (MPO-475)
    if (!Object.is(shownRef.current, committed)) {
      // oxlint-disable-next-line react/refs -- same render-phase adjustment; records the value now shown
      shownRef.current = committed;
      setResetKey((key) => key + 1);
    }
  }

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearBlurTimer, [clearBlurTimer]);

  const commitDraft = useCallback(() => {
    clearBlurTimer();
    const active = draftRef.current;
    if (!active) {
      return;
    }
    if (!Object.is(active.value, committedRef.current)) {
      // Optimistically mark the draft committed so the Enter path and the
      // trailing focus-out timer can't double-fire onCommit for one confirm.
      committedRef.current = active.value;
      onCommitRef.current(active.value);
    }
    // The draft object itself stays until the committed prop catches up (see
    // render adjustment above) so controlled fields don't flash the stale
    // value between the commit and the parent's data update.
  }, [clearBlurTimer]);

  const cancelDraft = useCallback(() => {
    clearBlurTimer();
    setSessionActive(false);
    draftRef.current = null;
    setDraft(null);
    shownRef.current = committedRef.current;
    // Remount the field: uncontrolled editors and popover-internal state
    // (DateRange mid-pick) hold edits that no prop change can reset.
    setResetKey((key) => key + 1);
  }, [clearBlurTimer]);

  const handleDraftChange = useCallback(
    (value: T) => {
      shownRef.current = value;
      if (mode === 'change') {
        onCommitRef.current(value);
        return;
      }
      draftRef.current = { value };
      setDraft(draftRef.current);
      // Wheel/keyboard edits can create a draft without a pointer-down;
      // make sure the document listeners are active for it.
      setSessionActive(true);
    },
    [mode],
  );

  useEffect(() => {
    if (!isWeb || !sessionActive) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const handleDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelDraft();
      }
    };
    const handleDocPointerDown = (event: PointerEvent) => {
      if (containsAcrossPanels(containerRef.current, event.target)) {
        return;
      }
      setSessionActive(false);
      commitDraft();
    };
    document.addEventListener('keydown', handleDocKeyDown, true);
    document.addEventListener('pointerdown', handleDocPointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleDocKeyDown, true);
      document.removeEventListener('pointerdown', handleDocPointerDown, true);
    };
    // oxlint-disable-next-line react-doctor/prefer-use-effect-event -- cancelDraft/commitDraft are stable useCallbacks; useEffectEvent is not available in the supported React range
  }, [sessionActive, cancelDraft, commitDraft]);

  if (!isWeb) {
    return (
      <>
        {/* oxlint-disable-next-line react/refs -- the ref is read when the field emits, never during render */}
        {children(committed, (value: T) => {
          onCommitRef.current(value);
        })}
      </>
    );
  }

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      cancelDraft();
      return;
    }
    if (event.key === 'Enter' && mode === 'confirm') {
      const { target } = event;
      // Only confirm from text inputs — Enter on a popover day button is the
      // button's activation (toggle), not a confirm.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        // Blur first so uncontrolled editors (Stepper) flush their typed
        // text through onChange before the draft is committed.
        // oxlint-disable-next-line github/no-blur -- blurring flushes the uncontrolled editor's typed text through onChange before the commit
        target.blur();
        commitDraft();
      }
    }
  };

  // A focus-out schedules the commit; a focus-in landing back inside the
  // cell (popover day buttons, OTP auto-advance, country combobox) cancels
  // it — so the draft only commits when focus fully leaves the cell.
  const handleBlur = () => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      commitDraft();
    }, 0);
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- display:contents event boundary for the wrapped field; the field itself owns role and focus
    <div
      key={resetKey}
      ref={containerRef}
      style={{ display: 'contents' }}
      onKeyDown={handleKeyDown}
      onPointerDownCapture={() => {
        setSessionActive(true);
      }}
      onFocus={mode === 'confirm' ? clearBlurTimer : undefined}
      onBlur={mode === 'confirm' ? handleBlur : undefined}>
      {/* oxlint-disable-next-line react/refs -- handleDraftChange writes refs only when the field emits, never during render */}
      {children(draft ? draft.value : committed, handleDraftChange)}
    </div>
  );
};

const CellWrapper = ({
  children,
  justify = FLEX_START,
  minWidth,
}: {
  children: ReactNode;
  justify?: 'flex-start' | 'flex-end' | 'center';
  minWidth?: number;
}) => {
  // Fields render chromeless inside cells (useIsInTableCell strips the input
  // frame), so the cell chrome owns the focus affordance. LC-71: one ring on
  // the perceived control boundary (this wrapper). Keyboard-origin focus
  // rings via :has(:focus-visible); text-entry also rings on any input
  // focus (the carve-out). Mouse click on a checkbox/switch paints no ring.
  // Inner field outlines are suppressed by the composite-ring stylesheet.
  if (isWeb) {
    ensureCompositeFocusRing();
  }
  // Column + stretch layout so field roots adopt the cell width (input frames
  // carry minWidth 0 and shrink to fit); maxWidth + a horizontal-only clip
  // (overflow-x: clip pairs with overflow-y: visible, unlike hidden) catch
  // anything that still refuses to shrink, so in-cell editors never overlap
  // neighbor columns. The vertical axis stays visible because several forms
  // field frames resolve to 0-height boxes and center their content on the
  // wrapper's midline — a vertical clip would swallow them. flexGrow fills
  // the TableCell's height so that midline sits at the row center. Popover
  // and modal editors position with strategy "fixed", which escapes this
  // clip and keeps their natural width.
  return (
    <View
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems={justify === FLEX_START ? 'stretch' : justify}
      width="100%"
      maxWidth="100%"
      // Per-axis overflow is web-only CSS; RN styles know only `overflow`.
      {...(isWeb
        ? {
            overflowX: 'clip',
            overflowY: 'visible',
            className: 'mp-composite-ring mp-composite-ring-deep',
          }
        : undefined)}
      minWidth={minWidth}>
      {children}
    </View>
  );
};

const ModalCell = (props: ComponentProps<typeof CellModalEditor>) => (
  <CellWrapper>
    <CellModalEditor {...props} />
  </CellWrapper>
);

// ─── Cell ─────────────────────────────────────────────────────

// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component -- one flat dispatch over every field type; each case is a self-contained editor mount
export const DataTableCell = ({
  value,
  field = 'input',
  fieldProps = EMPTY_FIELD_PROPS,
  onChange,
  readOnly = false,
  disabled = false,
  columnId,
  columnLabel,
  rowIndex: _rowIndex,
  rowData,
  size,
  compact,
  linkedValue: _linkedValue,
  onLinkedChange: _onLinkedChange,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- one flat dispatch over every field type; each case is a self-contained editor mount
}: DataTableCellProps) => {
  // Cells are always compact unless caller explicitly opts out — table rows
  // are 40-44px tall, so default-sized fields overflow the row.
  const { knobProps } = useResolvedKnobs({ size, compact: compact ?? true });
  const passthrough: CellFieldProps = fieldProps;
  const {
    options,
    placeholder,
    min,
    max,
    step,
    precision,
    currency,
    currencyField,
    locale,
    defaultCountry,
    otpLength,
    mentions,
    maxRating,
    // oxlint-disable-next-line sonarjs/no-unused-vars -- pulled out so it is not spread onto the field component
    dateFormat: _dateFormat,
    timeFormat,
    minDate,
    maxDate,
    allowMultiple,
    // oxlint-disable-next-line sonarjs/no-unused-vars -- pulled out so it is not spread onto the field component
    dateRangeLinkedColumn: _dateRangeLinkedColumn,
    // oxlint-disable-next-line sonarjs/no-unused-vars -- pulled out so it is not spread onto the field component
    dateRangeIsEndColumn: _dateRangeIsEndColumn,
    render,
    ...restProps
  } = fieldProps;
  const cellName = passthrough['aria-label'] ?? columnLabel ?? columnId;

  // Keep onChange behind a ref so handleChange's identity stays stable across
  // parent re-renders. WiredTable/DataTable pass a fresh inline onChange every
  // render; fields that sync via useEffect([onChange]) (OTP, Phone, …) would
  // otherwise re-emit and loop (SB-T2-10).
  const onChangeRef = useRef(onChange);
  // oxlint-disable-next-line react/refs -- latest-callback ref: handleChange stays stable while calling the current onChange (SB-T2-10)
  onChangeRef.current = onChange;
  const handleChange = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives every field editor's emitted value; forwarded untouched to onChange
    (newValue: unknown) => {
      if (readOnly || disabled) {
        return;
      }
      onChangeRef.current(newValue);
    },
    [readOnly, disabled],
  );

  // DG-TBL-01: default cell justification from field/data type (overridable via align).
  const cellJustify = alignToFlex(getDefaultColumnAlign({ id: columnId, field, fieldProps }));

  // Custom render function. This branch intentionally precedes the read-only
  // branch (the renderer owns the cell's presentation in both modes), so the
  // cell's honest state travels as the render context: commits are already
  // blocked while readOnly/disabled (handleChange no-ops), and the renderer
  // must mirror that by going non-interactive (D-18.4 — Axiom 6).
  if (field === 'custom' && render) {
    return (
      // oxlint-disable-next-line react/refs -- handleChange only reads the ref when invoked from an event, never during render
      <CellWrapper justify={cellJustify}>{render(value, rowData, handleChange, { readOnly, disabled })}</CellWrapper>
    );
  }

  // A money cell is DISPLAY, in both modes. A Currency field is a decimal
  // STRING (a float would round it) and a grid row is not where a ledger
  // figure gets retyped — money is edited through the form surfaces (MPO-252).
  //
  // Formatting reads the ROW's own currency first, because a ledger genuinely
  // mixes currencies row by row; the column-level `currency` constant is the
  // fallback for rows carrying none. Nothing here converts between codes —
  // two currencies are two figures. See utils/money.ts.
  if (field === 'money') {
    const hasCurrencyField = currencyField !== undefined && currencyField !== '';
    const rowCurrency: unknown = hasCurrencyField ? rowData?.[currencyField] : undefined;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- row data is untyped; only a non-empty string row value is a currency code
    const resolvedCurrency = typeof rowCurrency === 'string' && rowCurrency !== '' ? rowCurrency : currency;
    return (
      <CellWrapper justify={cellJustify}>
        <Text
          numberOfLines={1}
          aria-label={cellName}
          fontSize={knobProps.label.fontSize}>
          {formatMoney(value, resolvedCurrency, locale)}
        </Text>
      </CellWrapper>
    );
  }

  // Read-only cells route through FieldDisplay (lightweight, view-only) rather
  // than mounting the full Edit component with disabled={true}. This keeps
  // large tables performant and gives heavy fields a purpose-built compact
  // representation. Edit-mode (below) still mounts the full field component.
  if (readOnly) {
    // Currency symbols ride through untouched: the money register in
    // `@repo/theme` owns symbol→ISO-code resolution (LC-12 one
    // channel per data class) and prefixes a symbol it has no code for, so a
    // cell never has to sanitize a value on the way to the formatter.
    return (
      <CellWrapper justify={cellJustify}>
        <FieldDisplay
          field={field}
          value={value}
          fieldProps={fieldProps}
          linkedValue={_linkedValue}
        />
      </CellWrapper>
    );
  }

  // Render appropriate field based on type
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- 'input', render-less 'custom' and any unlisted field fall through to the inline text editor
  switch (field) {
    // ─── Boolean inputs ───────────────────────────────────────
    case 'checkbox': {
      return (
        <CellWrapper justify="center">
          <Checkbox
            checked={Boolean(value)}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onCheckedChange={handleChange}
            disabled={disabled || readOnly}
            {...restProps}
            // Chromeless in-cell control has no field label — name it from
            // the column header (same fallback chain as select/combobox).
            checkboxProps={{
              'aria-label': passthrough['aria-label'] ?? columnLabel ?? columnId,
              ...passthrough.checkboxProps,
            }}
          />
        </CellWrapper>
      );
    }

    case 'switch': {
      return (
        <CellWrapper justify="center">
          <Switch
            checked={Boolean(value)}
            onCheckedChange={handleChange}
            disabled={disabled || readOnly}
            {...restProps}
            // Chromeless in-cell control has no field label — name it from
            // the column header (same fallback chain as select/combobox).
            switchProps={{
              'aria-label': passthrough['aria-label'] ?? columnLabel ?? columnId,
              ...passthrough.switchProps,
            }}
          />
        </CellWrapper>
      );
    }

    // ─── Selection inputs ─────────────────────────────────────
    case 'select': {
      return (
        <CellWrapper>
          <Select
            value={toCellText(value)}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={handleChange}
            options={options ?? []}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            size={knobProps.sizeToken}
            {...restProps}
            aria-label={passthrough['aria-label'] ?? cellName}
          />
        </CellWrapper>
      );
    }

    case 'combobox': {
      return (
        <CellWrapper>
          <Combobox
            value={toCellText(value)}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={handleChange}
            options={options ?? []}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            size={knobProps.sizeToken}
            {...restProps}
            aria-label={passthrough['aria-label'] ?? cellName}
          />
        </CellWrapper>
      );
    }

    case 'radiogroup': {
      // UX-022 / LC-06 OVERSIZED-EDIT: a horizontal radio row is wider than
      // narrow columns and the cell's overflow guard makes the clipped
      // options unreachable. The editor escapes the anchor: the cell face is
      // the current option label; options open in a popover (web) / sheet
      // (native), seeded at the current value. A pick commits and closes
      // (LC-21 COMMIT class — one value completes the contract).
      return (
        <CellWrapper>
          <CellOptionsEditor
            field="radiogroup"
            value={value}
            fieldProps={fieldProps}
            disabled={disabled || readOnly}
            label={cellName}>
            {(close) => (
              <RadioGroup
                value={toCellText(value)}
                // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
                onValueChange={(next: string) => {
                  handleChange(next);
                  close();
                }}
                options={options ?? []}
                disabled={disabled || readOnly}
                size={knobProps.sizeToken}
                orientation="vertical"
                {...restProps}
              />
            )}
          </CellOptionsEditor>
        </CellWrapper>
      );
    }

    case 'togglegroup': {
      const toggleValue = asFieldValue<ToggleValue>(value);
      const toggleValues = Array.isArray(toggleValue) ? toggleValue : [];
      // LC-06: the option strip is wider than a typical column (same clipping
      // class as radiogroup). Face is the current value; options live in an
      // anchored popover (web) / sheet (native). Single-select is COMMIT
      // class (pick closes); allowMultiple is COMPOSE (panel stays open).
      return (
        <CellWrapper>
          <CellOptionsEditor
            field="togglegroup"
            value={value}
            fieldProps={fieldProps}
            disabled={disabled || readOnly}
            label={cellName}
            dismissOnPick={!allowMultiple}>
            {(close) => (
              <ToggleGroup
                value={allowMultiple ? toggleValues : toggleValue}
                // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
                onValueChange={(next: string | string[]) => {
                  handleChange(next);
                  if (!allowMultiple) {
                    close();
                  }
                }}
                options={options ?? []}
                disabled={disabled || readOnly}
                type={allowMultiple ? 'multiple' : 'single'}
                size={knobProps.sizeToken}
                orientation="vertical"
                {...restProps}
              />
            )}
          </CellOptionsEditor>
        </CellWrapper>
      );
    }

    // ─── Numeric inputs ───────────────────────────────────────
    case 'stepper': {
      // Free-entry numeric editor: buffer as a draft; commit on Enter/blur,
      // Escape reverts (wheel/arrow ticks also stay in the draft until blur).
      return (
        // Native keeps stretch (like the Slider fill-type opt-out below): RN
        // TextInput has no intrinsic width, so the end-aligned (non-stretch)
        // numeric column collapses the chromeless input to 0pt — invisible
        // AND culled from the a11y tree (iOS strips zero-rect subtrees). Web
        // inputs carry an intrinsic width, so numeric end-alignment stays.
        <CellWrapper justify={isWeb ? cellJustify : FLEX_START}>
          <DraftFieldEditor
            committed={value}
            onCommit={handleChange}>
            {(draftValue, onDraftChange) => (
              <Stepper
                defaultValue={draftValue == null ? undefined : Number(draftValue)}
                onChange={onDraftChange}
                min={min}
                max={max}
                step={step ?? 1}
                precision={precision ?? 0}
                currency={currency}
                disabled={disabled}
                readOnly={readOnly}
                placeholder={placeholder ?? '0'}
                size={knobProps.sizeToken}
                // In-cell stepper renders as plain numeric input — full +/- buttons
                // overflow narrow columns. Wheel and keyboard arrows still work.
                showButtons={false}
                {...restProps}
                // Chromeless in-cell control has no field label — name it from
                // the column header (same fallback chain as checkbox/select).
                inputProps={{
                  'aria-label': passthrough['aria-label'] ?? columnLabel ?? columnId,
                  ...passthrough.inputProps,
                }}
              />
            )}
          </DraftFieldEditor>
        </CellWrapper>
      );
    }

    case 'slider': {
      return (
        // Fill-type control: number columns justify flex-end, but flex-end
        // kills cross-axis stretch and a Slider has no intrinsic width — the
        // whole track collapses to 0. Sliders fill the cell instead of
        // aligning (align-by-type governs content, not fill controls).
        <CellWrapper
          justify="flex-start"
          minWidth={120}>
          <Slider
            value={[value == null ? (min ?? 0) : Number(value)]}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={
              readOnly
                ? undefined
                : (values) => {
                    handleChange(values[0]);
                  }
            }
            min={min ?? 0}
            max={max ?? 100}
            step={step ?? 1}
            disabled={disabled}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    case 'progress': {
      return (
        <CellWrapper
          justify={cellJustify}
          minWidth={120}>
          <Progress
            value={value == null ? 0 : Number(value)}
            size={knobProps.sizeToken}
            {...restProps}
            // Tamagui Progress's size variant pins width/minWidth (~220px),
            // overriding the frame's width="100%" and overflowing narrow
            // columns. progressProps spreads after the size variant, so it
            // wins and the bar adopts the cell width.
            progressProps={{ width: '100%', minWidth: 0, ...passthrough.progressProps }}
          />
        </CellWrapper>
      );
    }

    case 'rating': {
      // Rating's value contract is a 0–1 fraction of maxStars. Cells store the
      // raw star count (e.g. 4 of 5), so we translate in both directions.
      const stars = maxRating ?? 5;
      const fraction = value == null ? 0 : Number(value) / stars;
      return (
        <CellWrapper justify="center">
          <Rating
            value={Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0}
            onChange={(v: number) => {
              handleChange(Math.round(v * stars));
            }}
            disabled={disabled || readOnly}
            maxStars={stars}
            starIcon={passthrough.starIcon ?? CellStar}
            size={knobProps.sizeToken}
            compact
          />
        </CellWrapper>
      );
    }

    // ─── Date/Time inputs ─────────────────────────────────────
    case 'datepicker': {
      return (
        <CellWrapper>
          <DatePicker
            value={asFieldValue<DateValue>(value)}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder ?? t('Select date')}
            minDate={minDate}
            maxDate={maxDate}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    case 'datetimepicker': {
      return (
        <CellWrapper>
          <DatetimePicker
            value={asFieldValue<DateValue>(value)}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder ?? t('Select date & time')}
            minDate={minDate}
            maxDate={maxDate}
            timeFormat={timeFormat}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    case 'timepicker': {
      return (
        <CellWrapper>
          <TimePicker
            value={asFieldValue<string | undefined>(value) ?? ''}
            onChange={handleChange}
            disabled={disabled}
            placeholder={placeholder ?? t('Select time')}
            timeFormat={timeFormat}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    case 'daterangepicker': {
      // The picker only emits complete {start,end} ranges (or null on clear),
      // and completing a range closes the popover — those are the confirm
      // gestures, so commits pass straight through. Escape remounts the
      // picker to discard a half-picked range (start chosen, end pending).
      return (
        <CellWrapper>
          <DraftFieldEditor
            committed={asFieldValue<DateRangeValue>(value)}
            onCommit={handleChange}
            mode="change">
            {(draftValue, onDraftChange) => (
              <DateRangePicker
                value={draftValue}
                onChange={onDraftChange}
                disabled={disabled}
                placeholder={placeholder ?? t('Select range')}
                minDate={minDate}
                maxDate={maxDate}
                size={knobProps.sizeToken}
                {...restProps}
              />
            )}
          </DraftFieldEditor>
        </CellWrapper>
      );
    }

    case 'multidatepicker': {
      // Accumulating editor: day toggles build a draft; one commit fires when
      // the cell is left/closed (blur or outside click), Escape discards.
      return (
        <CellWrapper>
          <DraftFieldEditor
            committed={asFieldValue<MultiDateValue>(value)}
            onCommit={handleChange}>
            {(draftValue, onDraftChange) => (
              <MultiDatePicker
                value={draftValue}
                onChange={onDraftChange}
                disabled={disabled}
                placeholder={placeholder ?? t('Select dates')}
                minDate={minDate}
                maxDate={maxDate}
                size={knobProps.sizeToken}
                {...restProps}
              />
            )}
          </DraftFieldEditor>
        </CellWrapper>
      );
    }

    case 'duration': {
      return (
        <CellWrapper justify={cellJustify}>
          <Duration
            value={value == null ? 0 : Number(value)}
            onChange={handleChange}
            disabled={disabled}
            placeholder={placeholder ?? t('Select duration')}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    // ─── Special inputs ───────────────────────────────────────
    case 'colorpicker': {
      return (
        <CellWrapper>
          <ColorPicker
            value={asFieldValue<string | undefined>(value) ?? ''}
            // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
            onValueChange={handleChange}
            placeholder={placeholder ?? '#000000'}
            disabled={disabled}
            readOnly={readOnly}
            size={knobProps.sizeToken}
            {...restProps}
          />
        </CellWrapper>
      );
    }

    case 'phoneinput': {
      // Free-entry editor emitting per keystroke: buffer as a draft; commit
      // on Enter/blur, Escape reverts.
      return (
        <CellWrapper>
          <DraftFieldEditor
            committed={value}
            onCommit={handleChange}>
            {(draftValue, onDraftChange) => (
              <PhoneInput
                defaultValue={draftValue ?? ''}
                onChange={onDraftChange}
                disabled={disabled}
                readOnly={readOnly}
                placeholder={placeholder ?? t('Phone number')}
                defaultCountry={defaultCountry}
                size={knobProps.sizeToken}
                {...restProps}
              />
            )}
          </DraftFieldEditor>
        </CellWrapper>
      );
    }

    case 'otp': {
      // Multi-digit accumulation: digits build a draft; commit on Enter or
      // when focus leaves the cell (auto-advance between digit inputs stays
      // inside), Escape reverts.
      return (
        // Native start-aligns: the digit row is physically wider than narrow
        // cells (4 tap targets), and center-justification overflows it
        // symmetrically — the first digit lands off-cell/off-screen. Start
        // alignment keeps digit 1 anchored; overflow spills toward the
        // trailing edge where RN leaves it visible. Web keeps center (its
        // CellWrapper clips overflow-x at the cell edge instead).
        <CellWrapper justify={isWeb ? 'center' : FLEX_START}>
          <DraftFieldEditor
            committed={asFieldValue<string | undefined>(value)}
            onCommit={handleChange}>
            {(draftValue, onDraftChange) => (
              <OTPInput
                value={draftValue ?? ''}
                onChange={onDraftChange}
                disabled={disabled || readOnly}
                length={otpLength ?? 6}
                size={knobProps.sizeToken}
                {...restProps}
              />
            )}
          </DraftFieldEditor>
        </CellWrapper>
      );
    }

    case 'mentioninput': {
      return (
        <ModalCell
          field="mentioninput"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Edit text')}>
          {(draftValue, onDraftChange) => (
            <MentionInput
              defaultValue={draftValue ?? ''}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onTextChange={onDraftChange}
              disabled={disabled}
              readOnly={readOnly}
              placeholder={placeholder ?? t('Enter text...')}
              mentions={mentions ? [{ trigger: '@', data: mentions }] : [{ trigger: '@', data: [] }]}
              size={knobProps.sizeToken}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'barcode': {
      // LC-06: the full editor (input + scan button + camera scanner surface)
      // is far larger than the cell anchor, so it opens in the modal editor
      // like other heavy fields — never inline where the scanner would grow
      // the row. The cell face is FieldDisplay's compact drawn-barcode preview.
      return (
        <ModalCell
          field="barcode"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Barcode')}>
          {(draftValue, onDraftChange) => (
            <View
              flexDirection="column"
              {...knobProps.gap}>
              <Barcode
                value={toCellText(draftValue)}
                onChange={onDraftChange}
                disabled={disabled}
                readOnly={readOnly}
                size={knobProps.sizeToken}
                barcodeIcon={passthrough.barcodeIcon}
                scanIcon={passthrough.scanIcon}
                stopIcon={passthrough.stopIcon}
                {...restProps}
              />
              <BarcodePreview
                value={toCellText(draftValue)}
                height={64}
                moduleWidth={2}
                showText
              />
            </View>
          )}
        </ModalCell>
      );
    }

    // ─── File/media inputs ────────────────────────────────────
    case 'fileupload': {
      return (
        <ModalCell
          field="fileupload"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Upload file')}>
          {(draftValue, onDraftChange) => (
            <FileUpload
              defaultValue={draftValue}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onValueChange={onDraftChange}
              disabled={disabled}
              readOnly={readOnly}
              placeholder={placeholder ?? t('Upload file')}
              accept={passthrough.accept}
              size={knobProps.sizeToken}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'image': {
      return (
        <ModalCell
          field="image"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Image')}>
          {(draftValue, onDraftChange) => (
            <ImageField
              value={asFieldValue<ImageValue>(draftValue)}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onValueChange={onDraftChange}
              disabled={disabled}
              readOnly={readOnly}
              imageWidth={200}
              imageHeight={200}
              showRemove={!readOnly}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'signature': {
      return (
        <ModalCell
          field="signature"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Signature')}>
          {(draftValue, onDraftChange) => (
            <Signature
              value={asFieldValue<string | undefined>(draftValue) ?? ''}
              onChange={onDraftChange}
              disabled={disabled}
              size={knobProps.sizeToken}
              width={passthrough.width ?? 600}
              height={passthrough.height ?? 240}
              clearIcon={passthrough.clearIcon}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'geolocation': {
      return (
        <ModalCell
          field="geolocation"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Location')}>
          {(draftValue, onDraftChange) => (
            <Geolocation
              value={toGeolocationText(draftValue)}
              onChange={onDraftChange}
              disabled={disabled}
              size={knobProps.sizeToken}
              locationIcon={passthrough.locationIcon}
              expandIcon={passthrough.expandIcon}
              renderMap={passthrough.renderMap}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    // ─── Rich text / code editors ─────────────────────────────
    case 'richtexteditor': {
      return (
        <ModalCell
          field="richtexteditor"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Edit')}>
          {(draftValue, onDraftChange) => (
            <RichTextEditor
              value={toCellText(draftValue)}
              onChange={onDraftChange}
              disabled={disabled}
              readOnly={readOnly}
              placeholder={placeholder ?? t('Write something...')}
              minHeight={passthrough.minHeight ?? 240}
              size={knobProps.sizeToken}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'markdowneditor': {
      return (
        <ModalCell
          field="markdowneditor"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Edit markdown')}>
          {(draftValue, onDraftChange) => (
            <TextArea
              value={toCellText(draftValue)}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onChangeText={onDraftChange}
              placeholder={placeholder ?? t('Markdown...')}
              disabled={disabled}
              readOnly={readOnly}
              size={knobProps.sizeToken}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    case 'codeeditor': {
      return (
        <ModalCell
          field="codeeditor"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Edit code')}>
          {(draftValue, onDraftChange) => (
            <TextArea
              value={toCellText(draftValue)}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onChangeText={onDraftChange}
              placeholder={placeholder ?? t('Code...')}
              disabled={disabled}
              readOnly={readOnly}
              size={knobProps.sizeToken}
              {...restProps}
            />
          )}
        </ModalCell>
      );
    }

    // ─── Text inputs ──────────────────────────────────────────
    case 'textarea': {
      // LC-06 / Airtable expand / Frappe Text Editor: multiline text is
      // taller than the row. Face is a single-line FieldDisplay; the editor
      // opens in the modal (web) / sheet (native) so the anchor row never
      // grows. Staging matches the other compose editors (Done / Cancel).
      return (
        <ModalCell
          field="textarea"
          value={value}
          fieldProps={fieldProps}
          disabled={disabled}
          readOnly={readOnly}
          onCommit={handleChange}
          label={cellName}
          title={t('Edit text')}>
          {(draftValue, onDraftChange) => (
            <TextArea
              value={toCellText(draftValue)}
              // oxlint-disable-next-line typescript/no-deprecated -- the alias fires from the same emit; restProps may carry onChange and must not override the cell handler
              onChangeText={onDraftChange}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              size={knobProps.sizeToken}
              {...restProps}
              textAreaProps={{
                'aria-label': cellName,
                // TextArea has no top-level minHeight prop; the modal editor's
                // taller-than-row height rides the underlying textarea element.
                minHeight: passthrough.minHeight ?? 160,
                ...passthrough.textAreaProps,
              }}
            />
          )}
        </ModalCell>
      );
    }

    default: {
      return (
        <CellWrapper justify={cellJustify}>
          <InlineTextEditor
            value={value}
            onCommit={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            sizeToken={knobProps.sizeToken}
            ariaLabel={passthrough['aria-label'] ?? columnLabel ?? columnId}
            restProps={restProps}
          />
        </CellWrapper>
      );
    }
  }
};
