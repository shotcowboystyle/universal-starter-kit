// The compatibility name for the desk's report view. It used to compose its
// own grid around the old FrappeReportBuilder; the desk report is
// DoctypeReportView (FrappeReportBuilder under the desk's navigation) and
// this name renders exactly that now (MPO-15, GL-28).
export { parseReportFiltersParam } from '@repo/frappe-ui';
export { DoctypeReportView as ReportView } from '../report/DoctypeReportView';
export type { DoctypeReportViewProps as ReportViewProps } from '../report/DoctypeReportView';
