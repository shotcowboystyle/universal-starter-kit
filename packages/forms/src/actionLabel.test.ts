import { describe, expect, it } from 'vitest';

import { formatActionLabel } from './actionLabel';

describe('formatActionLabel', () => {
  it('formats verb alone in sentence case', () => {
    expect(formatActionLabel({ verb: 'delete' })).toBe('Delete');
    expect(formatActionLabel({ verb: 'Save' })).toBe('Save');
  });

  it('appends noun without articles', () => {
    expect(formatActionLabel({ verb: 'Delete', noun: 'pipeline' })).toBe('Delete pipeline');
    expect(formatActionLabel({ verb: 'Archive', noun: 'the invoice' })).toBe('Archive invoice');
    expect(formatActionLabel({ verb: 'Remove', noun: 'an attachment' })).toBe('Remove attachment');
  });

  it('ignores empty / whitespace noun', () => {
    expect(formatActionLabel({ verb: 'Cancel', noun: '  ' })).toBe('Cancel');
    expect(formatActionLabel({ verb: 'Cancel' })).toBe('Cancel');
  });

  it('collapses internal whitespace', () => {
    expect(formatActionLabel({ verb: '  Soft   delete  ', noun: ' draft  row ' })).toBe('Soft delete draft row');
  });
});
