/**
 * Audit Diff Reporter
 *
 * Compares two AuditReport snapshots (pre/post change) and produces
 * a human-readable delta in constraint terms.
 */

import type { AuditReport, ElementAudit, PropertyAudit, TextPropertyAudit } from './constraintAudit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyDiff {
  property: string;
  before: PropertyAudit | TextPropertyAudit | undefined;
  after: PropertyAudit | TextPropertyAudit | undefined;
  changed: boolean;
  becameViolation: boolean;
  fixedViolation: boolean;
}

export interface ElementDiff {
  label: string;
  tag: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
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

function propKey(el: ElementAudit, prop: string): PropertyAudit | TextPropertyAudit | undefined {
  return (el as unknown as Record<string, unknown>)[prop] as PropertyAudit | TextPropertyAudit | undefined;
}

function formatProp(p: PropertyAudit | TextPropertyAudit | undefined): string {
  if (!p) {
    return '(none)';
  }
  const flag = p.offScale ? ' ⚠ OFF-SCALE' : '';
  if ('unit' in p) {
    return `${p.value}${p.unit} → ${p.knob}${flag}`;
  }
  return `"${p.value}" → ${p.knob}${flag}`;
}

// ── Core diff function ────────────────────────────────────────────────────────

export function diffAuditReports(baseline: AuditReport, current: AuditReport): AuditDiff {
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

    if (!prev) {
      // New element
      elementsAdded++;
      const addedViolations = curr.violations;
      newViolations += addedViolations.length;
      if (addedViolations.length > 0) {
        elementDiffs.push({
          label,
          tag: curr.tag,
          status: 'added',
          propertyDiffs: [],
          newViolations: addedViolations,
          fixedViolations: [],
        });
      }
      continue;
    }

    // Compare properties
    const propertyDiffs: PropertyDiff[] = [];
    let hasChanges = false;

    for (const prop of AUDITED_PROPS) {
      const before = propKey(prev, prop);
      const after = propKey(curr, prop);

      const beforeStr = JSON.stringify(before);
      const afterStr = JSON.stringify(after);
      if (beforeStr === afterStr) {
        continue;
      }

      hasChanges = true;
      const becameViolation = !before?.offScale && (after?.offScale ?? false);
      const fixedViolation = (before?.offScale ?? false) && !after?.offScale;

      if (becameViolation) {
        newViolations++;
      }
      if (fixedViolation) {
        fixedViolations++;
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

    // Check for violation changes not captured by property changes
    const prevViolSet = new Set(prev.violations);
    const currViolSet = new Set(curr.violations);
    const newViol = curr.violations.filter((v) => !prevViolSet.has(v));
    const fixedViol = prev.violations.filter((v) => !currViolSet.has(v));

    if (hasChanges || newViol.length > 0 || fixedViol.length > 0) {
      elementsChanged++;
      elementDiffs.push({
        label,
        tag: curr.tag,
        status: 'changed',
        propertyDiffs,
        newViolations: newViol,
        fixedViolations: fixedViol,
      });
    }
  }

  // Check for removed elements
  for (const [label, prev] of baselineByLabel) {
    if (!currentByLabel.has(label)) {
      elementsRemoved++;
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

  // ── Format human-readable report ──────────────────────────────────────────

  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w('# Design Constraint Audit Diff');
  w('');
  w(`Baseline: ${baseline.timestamp} | ${baseline.url}`);
  w(`Current:  ${current.timestamp} | ${current.url}`);
  if (baseline.preset !== current.preset) {
    w(`Preset changed: ${baseline.preset} → ${current.preset}`);
  } else {
    w(`Preset: ${current.preset}`);
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

  const changed = elementDiffs.filter((d) => d.status === 'changed' && d.propertyDiffs.length > 0);
  const newViolElements = elementDiffs.filter((d) => d.newViolations.length > 0);

  if (changed.length > 0) {
    w('## Property Changes');
    w('');
    for (const diff of changed) {
      w(`### \`${diff.label}\``);
      for (const pd of diff.propertyDiffs) {
        const flag = pd.becameViolation ? ' ⚠ VIOLATION' : pd.fixedViolation ? ' ✓ FIXED' : '';
        w(`- **${pd.property}**: ${formatProp(pd.before)} → ${formatProp(pd.after)}${flag}`);
      }
      w('');
    }
  }

  if (newViolElements.length > 0) {
    w('## New Violations');
    w('');
    for (const diff of newViolElements) {
      w(`### \`${diff.label}\` (${diff.status})`);
      for (const v of diff.newViolations) {
        w(`- ⚠ ${v}`);
      }
      if (diff.fixedViolations.length > 0) {
        for (const v of diff.fixedViolations) {
          w(`- ✓ Fixed: ${v}`);
        }
      }
      w('');
    }
  }

  if (newViolations === 0 && elementsChanged === 0 && elementsAdded === 0 && elementsRemoved === 0) {
    w('No structural changes detected. Everything looks identical.');
  } else if (newViolations === 0) {
    w('No new constraint violations introduced.');
  }

  return {
    baselineUrl: baseline.url,
    currentUrl: current.url,
    baselineTimestamp: baseline.timestamp,
    currentTimestamp: current.timestamp,
    baselinePreset: baseline.preset,
    currentPreset: current.preset,
    summary: {
      elementsAdded,
      elementsRemoved,
      elementsChanged,
      newViolations,
      fixedViolations,
      netViolationChange,
    },
    elementDiffs,
    report: lines.join('\n'),
  };
}

// ── Format a single AuditReport as a readable report ─────────────────────────

export function formatAuditReport(report: AuditReport): string {
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
      w(`- \`${el.label}\`: ${props.join(', ')}`);
    }
  }

  return lines.join('\n');
}
