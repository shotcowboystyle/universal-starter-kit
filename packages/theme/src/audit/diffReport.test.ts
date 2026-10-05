import { describe, expect, it } from 'vitest';

import type { AuditReport, ElementAudit, AuditSummary } from './constraintAudit';
import { diffAuditReports, formatAuditReport } from './diffReport';

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  const defaultSummary: AuditSummary = {
    totalElements: 10,
    auditedElements: 2,
    totalViolations: 0,
    byProperty: {
      borderRadius: 0,
      borderWidth: 0,
      gap: 0,
      padding: 0,
      fontWeight: 0,
      fontFamily: 0,
      inlineColor: 0,
    },
  };
  return {
    url: 'http://localhost',
    timestamp: '2025-01-01T00:00:00Z',
    preset: 'default',
    scheme: 'light',
    summary: defaultSummary,
    violations: [],
    elements: [],
    ...overrides,
  };
}

function makeElement(label: string, overrides: Partial<ElementAudit> = {}): ElementAudit {
  return {
    label,
    tag: 'div',
    id: '',
    classes: [],
    violations: [],
    ...overrides,
  };
}

describe('diffAuditReports', () => {
  it('reports no changes for identical reports', () => {
    const report = makeReport();
    const diff = diffAuditReports(report, report);
    expect(diff.summary.elementsAdded).toBe(0);
    expect(diff.summary.elementsRemoved).toBe(0);
    expect(diff.summary.elementsChanged).toBe(0);
    expect(diff.summary.netViolationChange).toBe(0);
  });

  it('detects added elements with violations', () => {
    const baseline = makeReport();
    const current = makeReport({
      elements: [makeElement('div.new', { violations: ['borderRadius: 11px is off-scale'] })],
    });
    const diff = diffAuditReports(baseline, current);
    expect(diff.summary.elementsAdded).toBe(1);
    expect(diff.summary.newViolations).toBe(1);
  });

  it('detects removed elements', () => {
    const baseline = makeReport({
      elements: [makeElement('div.old', { violations: ['gap: 15px is off-scale'] })],
    });
    const current = makeReport();
    const diff = diffAuditReports(baseline, current);
    expect(diff.summary.elementsRemoved).toBe(1);
    expect(diff.summary.fixedViolations).toBe(1);
  });

  it('detects property changes on elements', () => {
    const baseline = makeReport({
      elements: [
        makeElement('div.item', {
          borderRadius: { value: 5, unit: 'px', knob: 'small', offScale: false },
        }),
      ],
    });
    const current = makeReport({
      elements: [
        makeElement('div.item', {
          borderRadius: { value: 11, unit: 'px', knob: 'off-scale', offScale: true },
          violations: ['borderRadius: 11px is off-scale'],
        }),
      ],
    });
    const diff = diffAuditReports(baseline, current);
    expect(diff.summary.elementsChanged).toBe(1);
    expect(diff.summary.newViolations).toBe(1);
  });

  it('detects fixed violations', () => {
    const baseline = makeReport({
      elements: [
        makeElement('div.item', {
          borderRadius: { value: 11, unit: 'px', knob: 'off-scale', offScale: true },
          violations: ['borderRadius: 11px is off-scale'],
        }),
      ],
    });
    const current = makeReport({
      elements: [
        makeElement('div.item', {
          borderRadius: { value: 5, unit: 'px', knob: 'small', offScale: false },
        }),
      ],
    });
    const diff = diffAuditReports(baseline, current);
    expect(diff.summary.fixedViolations).toBeGreaterThanOrEqual(1);
  });

  it('calculates net violation change', () => {
    const baseline = makeReport({
      elements: [makeElement('div.a', { violations: ['old violation'] })],
    });
    const current = makeReport({
      elements: [makeElement('div.a'), makeElement('div.b', { violations: ['new1', 'new2'] })],
    });
    const diff = diffAuditReports(baseline, current);
    expect(diff.summary.newViolations).toBe(2);
  });

  it('records preset change in metadata', () => {
    const baseline = makeReport({ preset: 'alpha' });
    const current = makeReport({ preset: 'beta' });
    const diff = diffAuditReports(baseline, current);
    expect(diff.baselinePreset).toBe('alpha');
    expect(diff.currentPreset).toBe('beta');
    expect(diff.report).toContain('alpha');
    expect(diff.report).toContain('beta');
  });

  it('generates a human-readable report string', () => {
    const baseline = makeReport();
    const current = makeReport();
    const diff = diffAuditReports(baseline, current);
    expect(diff.report).toContain('# Design Constraint Audit Diff');
    expect(diff.report).toContain('## Summary');
  });
});

describe('formatAuditReport', () => {
  it('formats a clean report', () => {
    const report = makeReport({
      elements: [
        makeElement('div.clean', {
          borderRadius: { value: 9, unit: 'px', knob: 'medium', offScale: false },
        }),
      ],
    });
    const text = formatAuditReport(report);
    expect(text).toContain('# Design Constraint Audit Report');
    expect(text).toContain('No constraint violations found');
  });

  it('formats a report with violations', () => {
    const report = makeReport({
      summary: {
        totalElements: 10,
        auditedElements: 1,
        totalViolations: 1,
        byProperty: {
          borderRadius: 1,
          borderWidth: 0,
          gap: 0,
          padding: 0,
          fontWeight: 0,
          fontFamily: 0,
          inlineColor: 0,
        },
      },
      violations: [
        makeElement('div.bad', {
          violations: ['borderRadius: 11px is off-scale'],
        }),
      ],
    });
    const text = formatAuditReport(report);
    expect(text).toContain('## Violations');
    expect(text).toContain('borderRadius: 11px is off-scale');
  });

  it('includes summary statistics', () => {
    const report = makeReport();
    const text = formatAuditReport(report);
    expect(text).toContain('Total elements on page');
    expect(text).toContain('Elements with violations');
  });
});
