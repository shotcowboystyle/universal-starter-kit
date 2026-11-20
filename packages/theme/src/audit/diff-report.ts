/**
 * Audit Diff Reporter
 *
 * Compares two AuditReport snapshots (pre/post change) and produces
 * a human-readable delta in constraint terms.
 */

import type { AuditReport, ElementAudit, PropertyAudit, TextPropertyAudit } from './constraint-audit';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditedProperty = PropertyAudit | TextPropertyAudit;

export interface PropertyDiff {
  property: string;
  before: AuditedProperty | undefined;
  after: AuditedProperty | undefined;
  changed: boolean;
  becameViolation: boolean;
  fixedViolation: boolean;
}

export type ElementDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ElementDiff {
  label: string;
  tag: string;
  status: ElementDiffStatus;
  propertyDiffs: PropertyDiff[];
  newViolations: string[];
  fixedViolations: string[];
}

export interface AuditDiff {
  baselineUrl: string;
  currentUrl: string;
  baselineTimestamp: string;
  currentTimestamp: string;
  baselinePreset: string;
  currentPreset: string;
  summary: {
    elementsAdded: number;
    elementsRemoved: number;
    elementsChanged: number;
    newViolations: number;
    fixedViolations: number;
    netViolationChange: number;
  };
  elementDiffs: ElementDiff[];
  /** Human-readable report text */
  report: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUDITED_PROPS = [
  'borderRadius',
  'borderWidth',
  'rowGap',
  'columnGap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontWeight',
  'fontFamily',
  'inlineColor',
] as const;

const propKey = (el: ElementAudit, prop: (typeof AUDITED_PROPS)[number]): AuditedProperty | undefined => el[prop];

const formatProp = (p: AuditedProperty | undefined): string => {
  if (!p) {
    return '(none)';
  }
  const flag = p.offScale ? ' ⚠ OFF-SCALE' : '';
  if ('unit' in p) {
    return `${p.value}${p.unit} → ${p.knob}${flag}`;
  }
  return `"${p.value}" → ${p.knob}${flag}`;
};

const violationFlag = (pd: PropertyDiff): string => {
  if (pd.becameViolation) {
    return ' ⚠ VIOLATION';
  }
  return pd.fixedViolation ? ' ✓ FIXED' : '';
};

interface PropertyDiffs {
  propertyDiffs: PropertyDiff[];
  newViolations: number;
  fixedViolations: number;
}

const diffProperties = (prev: ElementAudit, curr: ElementAudit): PropertyDiffs => {
  const propertyDiffs: PropertyDiff[] = [];
  let newViolations = 0;
  let fixedViolations = 0;

  for (const prop of AUDITED_PROPS) {
    const before = propKey(prev, prop);
    const after = propKey(curr, prop);

    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }

    const becameViolation = !before?.offScale && (after?.offScale ?? false);
    const fixedViolation = (before?.offScale ?? false) && !after?.offScale;

    if (becameViolation) {
      newViolations += 1;
    }
    if (fixedViolation) {
      fixedViolations += 1;
    }

    propertyDiffs.push({
      property: prop,
      before,
      after,
      changed: true,
      becameViolation,
      fixedViolation,
    });
  }

  return { propertyDiffs, newViolations, fixedViolations };
};

interface ChangedElement {
  diff: ElementDiff;
  newViolations: number;
  fixedViolations: number;
}

/** Diffs one element present in both reports; undefined when nothing changed. */
const diffChangedElement = (label: string, prev: ElementAudit, curr: ElementAudit): ChangedElement | undefined => {
  const { propertyDiffs, newViolations, fixedViolations } = diffProperties(prev, curr);

  // Check for violation changes not captured by property changes
  const prevViolSet = new Set(prev.violations);
  const currViolSet = new Set(curr.violations);
  const newViol = curr.violations.filter((v) => !prevViolSet.has(v));
  const fixedViol = prev.violations.filter((v) => !currViolSet.has(v));

  if (propertyDiffs.length === 0 && newViol.length === 0 && fixedViol.length === 0) {
    return undefined;
  }
  return {
    diff: {
      label,
      tag: curr.tag,
      status: 'changed',
      propertyDiffs,
      newViolations: newViol,
      fixedViolations: fixedViol,
    },
    newViolations,
    fixedViolations,
  };
};

interface DiffTotals {
  elementsAdded: number;
  elementsRemoved: number;
  elementsChanged: number;
  newViolations: number;
  fixedViolations: number;
  netViolationChange: number;
}

const propertyChangeLines = (elementDiffs: ElementDiff[]): string[] => {
  const changed = elementDiffs.filter((d) => d.status === 'changed' && d.propertyDiffs.length > 0);
  if (changed.length === 0) {
    return [];
  }
  const lines = ['## Property Changes', ''];
  for (const diff of changed) {
    lines.push(`### \`${diff.label}\``);
    for (const pd of diff.propertyDiffs) {
      lines.push(`- **${pd.property}**: ${formatProp(pd.before)} → ${formatProp(pd.after)}${violationFlag(pd)}`);
    }
    lines.push('');
  }
  return lines;
};

const newViolationLines = (elementDiffs: ElementDiff[]): string[] => {
  const newViolElements = elementDiffs.filter((d) => d.newViolations.length > 0);
  if (newViolElements.length === 0) {
    return [];
  }
  const lines = ['## New Violations', ''];
  for (const diff of newViolElements) {
    lines.push(`### \`${diff.label}\` (${diff.status})`);
    for (const v of diff.newViolations) {
      lines.push(`- ⚠ ${v}`);
    }
    for (const v of diff.fixedViolations) {
      lines.push(`- ✓ Fixed: ${v}`);
    }
    lines.push('');
  }
  return lines;
};

const formatDiffReport = (
  baseline: AuditReport,
  current: AuditReport,
  totals: DiffTotals,
  elementDiffs: ElementDiff[],
): string => {
  const { elementsAdded, elementsRemoved, elementsChanged, newViolations, fixedViolations, netViolationChange } =
    totals;
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w('# Design Constraint Audit Diff');
  w('');
  w(`Baseline: ${baseline.timestamp} | ${baseline.url}`);
  w(`Current:  ${current.timestamp} | ${current.url}`);
  if (baseline.preset === current.preset) {
    w(`Preset: ${current.preset}`);
  } else {
    w(`Preset changed: ${baseline.preset} → ${current.preset}`);
  }
  w('');
  w('## Summary');
  w(`- Elements added:   ${elementsAdded}`);
  w(`- Elements removed: ${elementsRemoved}`);
  w(`- Elements changed: ${elementsChanged}`);
  w(`- New violations:   ${newViolations}${newViolations > 0 ? ' ⚠' : ' ✓'}`);
  w(`- Fixed violations: ${fixedViolations}${fixedViolations > 0 ? ' ✓' : ''}`);
  w(`- Net change:       ${netViolationChange > 0 ? '+' : ''}${netViolationChange} violations`);
  w('');

  lines.push(...propertyChangeLines(elementDiffs), ...newViolationLines(elementDiffs));

  if (newViolations === 0 && elementsChanged === 0 && elementsAdded === 0 && elementsRemoved === 0) {
    w('No structural changes detected. Everything looks identical.');
  } else if (newViolations === 0) {
    w('No new constraint violations introduced.');
  }

  return lines.join('\n');
};

// ── Core diff function ────────────────────────────────────────────────────────

export const diffAuditReports = (baseline: AuditReport, current: AuditReport): AuditDiff => {
  // Index baseline elements by label for fast lookup
  const baselineByLabel = new Map<string, ElementAudit>();
  for (const el of baseline.elements) {
    baselineByLabel.set(el.label, el);
  }

  const currentByLabel = new Map<string, ElementAudit>();
  for (const el of current.elements) {
    currentByLabel.set(el.label, el);
  }

  const elementDiffs: ElementDiff[] = [];
  let elementsAdded = 0;
  let elementsRemoved = 0;
  let elementsChanged = 0;
  let newViolations = 0;
  let fixedViolations = 0;

  // Check all current elements
  for (const [label, curr] of currentByLabel) {
    const prev = baselineByLabel.get(label);

    if (prev) {
      const changedElement = diffChangedElement(label, prev, curr);
      if (changedElement) {
        elementsChanged += 1;
        newViolations += changedElement.newViolations;
        fixedViolations += changedElement.fixedViolations;
        elementDiffs.push(changedElement.diff);
      }
    } else {
      // New element
      elementsAdded += 1;
      newViolations += curr.violations.length;
      if (curr.violations.length > 0) {
        elementDiffs.push({
          label,
          tag: curr.tag,
          status: 'added',
          propertyDiffs: [],
          newViolations: curr.violations,
          fixedViolations: [],
        });
      }
    }
  }

  // Check for removed elements
  for (const [label, prev] of baselineByLabel) {
    if (!currentByLabel.has(label)) {
      elementsRemoved += 1;
      if (prev.violations.length > 0) {
        fixedViolations += prev.violations.length;
        elementDiffs.push({
          label,
          tag: prev.tag,
          status: 'removed',
          propertyDiffs: [],
          newViolations: [],
          fixedViolations: prev.violations,
        });
      }
    }
  }

  const netViolationChange = newViolations - fixedViolations;
  const summary = {
    elementsAdded,
    elementsRemoved,
    elementsChanged,
    newViolations,
    fixedViolations,
    netViolationChange,
  };

  return {
    baselineUrl: baseline.url,
    currentUrl: current.url,
    baselineTimestamp: baseline.timestamp,
    currentTimestamp: current.timestamp,
    baselinePreset: baseline.preset,
    currentPreset: current.preset,
    summary,
    elementDiffs,
    report: formatDiffReport(baseline, current, summary, elementDiffs),
  };
};

// ── Format a single AuditReport as a readable report ─────────────────────────

const auditedElementProps = (el: ElementAudit): string[] => {
  const props: string[] = [];
  if (el.borderRadius) {
    props.push(`radius=${el.borderRadius.knob}(${el.borderRadius.value}px)`);
  }
  if (el.borderWidth) {
    props.push(`bw=${el.borderWidth.knob}(${el.borderWidth.value}px)`);
  }
  if (el.rowGap) {
    props.push(`gap=${el.rowGap.knob}(${el.rowGap.value}px)`);
  }
  if (el.fontWeight) {
    props.push(`fw=${el.fontWeight.knob}`);
  }
  if (el.fontFamily) {
    props.push(`font=${el.fontFamily.knob}`);
  }
  if (el.inlineColor) {
    props.push(`color=${el.inlineColor.value}`);
  }
  return props;
};

export const formatAuditReport = (report: AuditReport): string => {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w('# Design Constraint Audit Report');
  w('');
  w(`URL:       ${report.url}`);
  w(`Timestamp: ${report.timestamp}`);
  w(`Preset:    ${report.preset}`);
  w(`Scheme:    ${report.scheme}`);
  w('');
  w('## Summary');
  w(`- Total elements on page:   ${report.summary.totalElements}`);
  w(`- Elements with styled props: ${report.summary.auditedElements}`);
  w(`- Elements with violations:   ${report.summary.totalViolations}`);
  w('');
  w('Violations by property:');
  w(`  borderRadius:  ${report.summary.byProperty.borderRadius}`);
  w(`  borderWidth:   ${report.summary.byProperty.borderWidth}`);
  w(`  gap:           ${report.summary.byProperty.gap}`);
  w(`  padding:       ${report.summary.byProperty.padding}`);
  w(`  fontWeight:    ${report.summary.byProperty.fontWeight}`);
  w(`  fontFamily:    ${report.summary.byProperty.fontFamily}`);
  w(`  inlineColor:   ${report.summary.byProperty.inlineColor}`);
  w('');

  if (report.violations.length === 0) {
    w('✓ No constraint violations found.');
  } else {
    w('## Violations');
    w('');
    for (const el of report.violations) {
      w(`### \`${el.label}\``);
      for (const v of el.violations) {
        w(`- ⚠ ${v}`);
      }
      w('');
    }
  }

  if (report.elements.length > 0 && report.violations.length === 0) {
    w('## Audited Elements (all compliant)');
    w('');
    for (const el of report.elements) {
      w(`- \`${el.label}\`: ${auditedElementProps(el).join(', ')}`);
    }
  }

  return lines.join('\n');
};
