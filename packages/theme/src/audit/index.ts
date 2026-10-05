export type { AuditReport, AuditSummary, ElementAudit, PropertyAudit, TextPropertyAudit } from './constraintAudit';
export { runConstraintAudit } from './constraintAudit';
export type { AuditDiff, ElementDiff, PropertyDiff } from './diffReport';
export { diffAuditReports, formatAuditReport } from './diffReport';
export type {
  ChartKind,
  ChartProofResult,
  ChartProofViolation,
  ChartUnmeasurableReason,
  MatrixChartPaint,
  MatrixChartSample,
  GeometryDiff,
  GeometryMove,
  IconContrastResult,
  IconContrastViolation,
  IconExclusion,
  IconUnmeasurableReason,
  IconUnverified,
  MatrixElementGeometry,
  MatrixIconSample,
  MatrixRect,
  MatrixSnapshot,
  MatrixTextSample,
  NoBreakageInput,
  NoBreakageResult,
  TextContrastResult,
  TextContrastViolation,
} from './themeMatrix';
export {
  auditSignatures,
  captureMatrixSnapshot,
  diffGeometry,
  evaluateNoBreakage,
  evaluateIconContrast,
  evaluateChartProof,
  chartProofSignatures,
  iconContrastSignatures,
  evaluateTextContrast,
} from './themeMatrix';
