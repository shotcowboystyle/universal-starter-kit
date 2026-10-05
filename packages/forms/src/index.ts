// ── Core Form ────────────────────────────────────────────────
export {
  Form,
  FormActions,
  useFormContext,
  useFormValidate,
  useFormSaveMode,
  useEffectiveValidateOn,
  resolveEffectiveValidateOn,
  remapValidatorsForTiming,
  FormValidateContext,
  FormSaveModeContext,
} from './Form';
export type {
  FormProps,
  FormActionsProps,
  FormValidateOn,
  FormValidateContextValue,
  FormSaveMode,
  FormSaveModeContextValue,
  EffectiveValidateOn,
} from './Form';

export { ContextualSaveBar, clientKnownIdentity, commitImmediateField } from './ContextualSaveBar';
export type { ContextualSaveBarProps, NavigationBlocker, UseNavigationBlocker } from './ContextualSaveBar';

// ── Error Summary ─────────────────────────────
export {
  ErrorSummary,
  collectFormFieldErrors,
  formatFieldError,
  normalizeFieldError,
  warnBannedErrorWords,
} from './ErrorSummary';
export type { ErrorSummaryProps, ErrorSummaryItem, FieldErrorMessage, StructuredFieldError } from './ErrorSummary';

// ── Field Layout & Infrastructure ────────────────────────────
export { Field, FieldLayout } from './fieldLayout';
export type { FieldProps, FormFieldProps, FieldLayoutProps } from './fieldLayout';

// ── Required marking ─────────────────────────────
export {
  RequiredMarkingContext,
  useRequiredMarking,
  computeRequiredMarkMode,
  formatRequiredMarkSuffix,
  mapHouseRequiredMarking,
} from './requiredMarking';
export type { RequiredMarkMode, RequiredMarkStrategy, RequiredMarkingContextValue } from './requiredMarking';

// ── Field defaults (width-by-purpose) ─────────────
export {
  FIELD_WIDTH_BY_PURPOSE,
  LABEL_COLUMN_MAX_CH,
  LABEL_COLUMN_WIDTH,
  resolveFieldPurpose,
  resolveFieldWidth,
  fieldWidthStyle,
  isFieldPurpose,
} from './fieldDefaults';
export type { FieldPurpose, FieldWidth, FieldWidthStyle } from './fieldDefaults';

// ── Types ────────────────────────────────────────────────────
export type {
  AnyFormApi,
  SimpleFieldApi,
  Validator,
  FieldComponentProps,
  ColorValue,
  WebInputProps,
  WebInputType,
  WebInputMode,
  FieldState,
  AnyFieldApi,
  MinimalFormApi,
  LinkResolver,
  ChildTableLinkResolver,
} from './types';

// ── Action labels ────────────────────
export { formatActionLabel } from './actionLabel';
export type { ActionLabelParts } from './actionLabel';

// ── Core Primitives ──────────────────────────────────────────
export { Button } from './Button';
export type { ButtonProps, ButtonActionRole } from './Button';

export { Input } from './fields/Input';
export type { InputProps } from './fields/Input';
export { Input as InputParts } from './InputParts';

export { SearchInput } from './fields/SearchInput';
export type { SearchInputProps } from './fields/SearchInput';

export { TextArea } from './fields/TextArea';
export type { TextAreaProps } from './fields/TextArea';

export { Select } from './fields/Select';
export type { SelectProps, SelectOption } from './fields/Select';

export { Combobox } from './fields/Combobox';
export type { ComboboxProps, ComboboxOption } from './fields/Combobox';

export { orderOptionsBySelected } from './fields/selectedOrder';
export type { SelectedOrder } from './fields/selectedOrder';

export { Checkbox, Checkboxes, CheckboxGroup } from './fields/Checkbox';
export type { CheckboxProps, CheckboxGroupProps, CheckboxGroupOption, CheckboxesProps } from './fields/Checkbox';

export { Switch } from './fields/Switch';
export type { SwitchProps } from './fields/Switch';

export { RadioGroup } from './fields/RadioGroup';
export type { RadioGroupProps, RadioGroupOption } from './fields/RadioGroup';

export { Slider } from './fields/Slider';
export type { SliderProps } from './fields/Slider';

export { TimeRangeScrubber } from './fields/TimeRangeScrubber';
export type { ActivitySpan, QuickRange, SnapTo, TimeRangeScrubberProps, TimeWindow } from './fields/TimeRangeScrubber';

export { ToggleGroup } from './fields/ToggleGroup';
export type { ToggleGroupOption, ToggleGroupProps } from './fields/ToggleGroup';

export { Label } from './Label';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { Progress } from './fields/Progress';
export type { ProgressIntent, ProgressProps } from './fields/Progress';

// ── Compound Components ──────────────────────────────────────
export {
  DatePicker,
  MultiDatePicker,
  DateRangePicker,
  Calendar,
  MonthPicker,
  DatetimePicker,
} from './fields/DatePicker';
export type {
  DatePickerProps,
  DateRange,
  MultiDatePickerProps,
  DateRangePickerProps,
  CalendarProps,
  CalendarMode,
  MonthPickerProps,
  MonthPickerValue,
  DatetimePickerProps,
} from './fields/DatePicker';

export { OTPInput } from './fields/OTPInput';
export type { OTPInputProps } from './fields/OTPInput';

export { PhoneInput } from './fields/PhoneInput';
export type { PhoneInputProps } from './fields/PhoneInput';

export { ColorPicker } from './fields/ColorPicker';
export type { ColorPickerProps } from './fields/ColorPicker';
export { PresetSwatches } from './fields/ColorPicker/parts';
export type { PresetSwatchesProps, PresetSwatchEntry } from './fields/ColorPicker/parts';

export { MentionInput } from './fields/MentionInput';
export type { MentionInputProps, MentionItem } from './fields/MentionInput';

export { Stepper } from './fields/Stepper';
export type { StepperProps } from './fields/Stepper';
export { resolveStepperPlacement, type StepperButtonPosition } from './fields/Stepper/resolveStepperPlacement';

export { FileUpload } from './fields/FileUpload';
export type { FileTransferError, FileUploadHandler, FileUploadProps } from './fields/FileUpload';

export { Rating } from './fields/Rating';
export type { RatingProps } from './fields/Rating';

export { Duration, DURATION_PRESET_SIZE } from './fields/Duration';
export type { DurationProps, DurationPreset } from './fields/Duration';

export { TimePicker } from './fields/TimePicker';
export type { TimePickerProps } from './fields/TimePicker';

export { Signature, signatureValueToSvg } from './fields/Signature';
export type { SignatureProps } from './fields/Signature';

export { Barcode } from './fields/Barcode';
export type { BarcodeProps } from './fields/Barcode';
export { BarcodePreview } from './fields/Barcode/BarcodePreview';
export type { BarcodePreviewProps } from './fields/Barcode/BarcodePreview';

export { Geolocation } from './fields/Geolocation';
export type { GeolocationProps, GeolocationMapProps } from './fields/Geolocation';
export type {
  GeocodeFn,
  GeocodeQuery,
  GeocodeResult,
  Geocoder,
  ReverseGeocodeFn,
  ReverseGeocodeQuery,
} from './fields/Geolocation/geocoder';
export { resolveGeocoder } from './fields/Geolocation/geocoder';
export { GeocoderProvider, useGeocoder } from './fields/Geolocation/geocoderContext';
export { createPhotonGeocoder } from './fields/Geolocation/photonGeocoder';
export type { PhotonGeocoderOptions } from './fields/Geolocation/photonGeocoder';

export { ImageField } from './fields/ImageField';
export type { ImageFieldProps } from './fields/ImageField';

export {
  Icon,
  DRAWN_ICON_NAMES,
  DrawnIcon,
  filterDrawnIcons,
  isDrawnIconName,
  parseIconOptions,
  resolveIconCatalog,
} from './fields/Icon';
export type { IconProps, DrawnIconName } from './fields/Icon';

// ── FieldDisplay (read-only render variants for table cells) ─
export { DescriptionListSlotProvider, FieldDisplay, useIsInDescriptionList } from './FieldDisplay';
export type { FieldDisplayAlign, FieldDisplayProps, FieldDisplayType } from './FieldDisplay';
export { FIELD_EDIT_MODE, getEditMode } from './FieldDisplay/editMode';
export type { EditMode } from './FieldDisplay/editMode';
export { formatDateText, formatNumericText } from './FieldDisplay/formatters';
export type { DateFormatOptions, NumericFormatOptions } from './FieldDisplay/formatters';

// ── Table Primitives (re-exported from @repo/table-primitives) ─
export { Table } from './Table';
export type {
  TableProps,
  TableRowProps,
  TableCellProps,
  TableHeaderCellProps,
  TableBodyProps,
  TableHeadProps,
  TableFootProps,
  TableCaptionProps,
} from './Table';

// ── Floating Panel ────────────────────────────────────────────
export {
  FloatingPanel,
  useFloatingPanel,
  useViewportGtSm,
  panelAnimationDuration,
  panelGrowDuration,
  panelTransition,
  panelViewportPadding,
} from './FloatingPanel';
export { PanelPortal } from './FloatingPanel/PanelPortal';
export type { PanelPortalProps } from './FloatingPanel/PanelPortal';
export { containsAcrossPanels } from './shared/panelPortal';
export type {
  FloatingPanelProps,
  PanelWidthMode,
  UseFloatingPanelOptions,
  UseFloatingPanelReturn,
} from './FloatingPanel';

// ── Adaptive Popup (Dialog / Drawer on desktop, Sheet on mobile) ─
export { AdaptivePopup, pickAdaptivePopupFace } from './AdaptivePopup';
export type { AdaptivePopupProps, AdaptivePopupRenderedFace } from './AdaptivePopup';

// ── Control Group (squish box-shaped controls into one unit) ──
export { ControlGroup } from './ControlGroup';
export type { ControlGroupProps } from './ControlGroup';

// ── Form Grid (multi-column layout with correct row-by-row tab order) ─────────
export { FormGrid, FORM_GRID_COLLAPSE_WIDTH } from './FormGrid';
export type { FormGridProps, FormGridColumns } from './FormGrid';

// ── DescriptionList (READ half of SchemaForm — composes FieldDisplay) ─
export { DescriptionList, PropertyList } from './DescriptionList';
export type {
  DescriptionListItem,
  DescriptionListPlacement,
  DescriptionListProps,
  DescriptionListRowProps,
} from './DescriptionList';

// ── Field grouping / section rhythm ─────────────────────
export { FieldGroup } from './FieldGroup';
export type { FieldGroupProps } from './FieldGroup';
export { FormSection, FormSectionStack, Fieldset } from './FormSection';
export type { FormSectionProps, FormSectionStackProps, FieldsetProps } from './FormSection';
export { formFieldGap, formSectionGap, formReadableMaxWidth } from './formSpacing';

// ── Input compound sub-components (for advanced composition) ─
export {
  InputContext,
  InputContainerFrame,
  InputIconFrame,
  InputFieldMeta,
  InputInfo,
  InputLabel,
  FocusContext,
  useForwardFocus,
  defaultInputGroupStyles,
  inputSizeVariant,
  mapKeyboardTypeToInputMode,
  mapInputModeToKeyboardType,
  KEYBOARD_TO_INPUT_MODE,
  INPUT_MODE_TO_KEYBOARD,
} from './InputParts';

export { useControlGrouped } from './shared/groupContext';

// ── Focus Management ─────────────────────────────────────────
export { useFocusManagement, focusFirstInvalid, focusFieldTarget } from './hooks/useFocusManagement';
export type { FocusManagementOptions, FocusManagementReturn } from './hooks/useFocusManagement';

// ── Shared Utilities ──────────────────────────────────────────
export {
  useFormField,
  getFieldError,
  mergeFieldHandler,
  useResolvedValidators,
  clampRadiusForControl,
  clampRadiusForLargeComponent,
  clampRadiusInStateProps,
} from './shared/utils';
export type { ClampRadiusInStatePropsOptions, StatePropsRadiusClass } from './shared/utils';
export { pressSlopOutsetProps, pressSlopProps } from './shared/pressSlopProps';
export type { PressSlopProps } from './shared/pressSlopProps';

// ── Table Cell Context (for chromeless field rendering) ───────
export { TableCellContext, useTableCellContext, useIsInTableCell } from './shared/tableCellContext';
export type { TableCellContextValue } from './shared/tableCellContext';

// ── Form color ramps (adapters must consume these, never raw tokens) ─
export { formCommonColors, formDropzoneColors } from './shared/colorRamps';

// ── Chip, Skeleton, Wheel (used by forms; re-exported for components consumers) ─
export { Chip, ChipFrame, ChipText, chipIconSize } from './Chip';
export type { ChipProps, ChipVariant, ChipColor, ChipSize, ChipFrameProps } from './Chip';
export { Skeleton, SkeletonText, SkeletonCircle } from './Skeleton';
export type { SkeletonProps, SkeletonVariant, SkeletonFrameProps } from './Skeleton';
export { Wheel } from './Wheel';
export type { WheelProps, WheelItem, WheelContainerProps, WheelItemProps, WheelHighlightEdges } from './Wheel';

// ── Z-Index Scale ─────────────────────────────────────────────
export { zIndex } from './shared/zIndex';
export type { ZIndexKey } from './shared/zIndex';

// ── TanStack Form re-exports ─────────────────────────────────
export {
  useForm,
  type FormApi,
  type FormOptions,
  type FieldApi,
  type DeepKeys,
  type DeepValue,
} from '@tanstack/react-form';
