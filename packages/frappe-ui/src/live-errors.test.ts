import { describe, expect, it } from 'vitest';

import { isPermissionError, toLiveLoadError } from './live-errors';

describe(isPermissionError, () => {
  it('treats HTTP 403 / 401 as permission', () => {
    expect(isPermissionError(Object.assign(new Error('nope'), { status: 403 }))).toBe(true);
    expect(isPermissionError(Object.assign(new Error('nope'), { status: 401 }))).toBe(true);
    expect(isPermissionError(Object.assign(new Error('nope'), { status: 500 }))).toBe(false);
  });

  it('treats a PermissionError exc_type as permission, whatever the sentence', () => {
    const err = Object.assign(new Error("You don't have access to Report: ToDo"), {
      exc_type: 'PermissionError',
    });
    expect(isPermissionError(err)).toBe(true);
    expect(isPermissionError(Object.assign(new Error('Timed out'), { exc_type: 'ValidationError' }))).toBe(false);
  });

  it('treats a PermissionError-shaped message as permission', () => {
    expect(isPermissionError(new Error('PermissionError'))).toBe(true);
    expect(isPermissionError(new Error("You don't have access to Report: ToDo"))).toBe(false);
  });
});

describe(toLiveLoadError, () => {
  const labels = {
    permissionMessage: 'You do not have permission to run ToDo',
    genericMessage: 'Error running ToDo',
  };

  it('keeps a readable server sentence as detail', () => {
    const err = Object.assign(new Error("You don't have access to Report: ToDo"), { status: 403 });
    expect(toLiveLoadError(err, labels).message).toBe(
      "You do not have permission to run ToDo: You don't have access to Report: ToDo",
    );
  });

  it('does not append a developer-mode python traceback to permission chrome', () => {
    const err = Object.assign(
      new Error('["Traceback (most recent call last):\\n  File "apps/frappe/frappe/app.py", line 120, in application'),
      { status: 403 },
    );
    const normalized = toLiveLoadError(err, labels);
    expect(normalized.message).toBe('You do not have permission to run ToDo');
    expect(normalized.message).not.toMatch(/Traceback/u);
  });

  it('does not append a traceback to a generic load failure either', () => {
    const err = new Error('["Traceback (most recent call last):\\n  File "apps/frappe/frappe/app.py"');
    const normalized = toLiveLoadError(err, labels);
    expect(normalized.message).toBe('Error running ToDo');
    expect(normalized.message).not.toMatch(/Traceback/u);
  });
});
