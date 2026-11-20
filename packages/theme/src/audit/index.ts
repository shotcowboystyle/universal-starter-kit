export type { AuditReport, AuditSummary, ElementAudit, PropertyAudit, TextPropertyAudit } from './constraint-audit';
export { runConstraintAudit } from './constraint-audit';
export type { AuditDiff, ElementDiff, PropertyDiff } from './diff-report';
export { diffAuditReports, formatAuditReport } from './diff-report';
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
} from './theme-matrix';
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
} from './theme-matrix';
