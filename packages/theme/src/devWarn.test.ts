import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetDevWarnSeen,
  devWarn,
  warnBannedErrorWords,
  warnBareDisabled,
  warnCancelDisabled,
  warnDialogTooManyActions,
  warnOutlineNone,
  warnPlaceholderAsLabel,
  warnPositiveTabIndex,
  warnSelectTooFewOptions,
  warnTooltipOnDisabled,
} from './devWarn';

describe('devWarn catalog (blueprint §5)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let prevEnv: string | undefined;

  beforeEach(() => {
    __resetDevWarnSeen();
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
    process.env.NODE_ENV = prevEnv;
  });

  it('no-ops in production', () => {
    process.env.NODE_ENV = 'production';
    devWarn('two-primaries', { component: 'ActionBar' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('dedupes identical keys', () => {
    devWarn('two-primaries', { component: 'ActionBar', id: 'r1' });
    devWarn('two-primaries', { component: 'ActionBar', id: 'r1' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('placeholder-as-label', () => {
    warnPlaceholderAsLabel({ placeholder: 'Name', component: 'FieldLayout', id: 'n' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('placeholder-as-label'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnPlaceholderAsLabel({ placeholder: 'Name', label: 'Name' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('banned-error-word covers the banned list including error', () => {
    warnBannedErrorWords('Invalid email', { component: 'Toast' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('word=invalid'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnBannedErrorWords('An error occurred', { component: 'Alert' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('word=error'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnBannedErrorWords('Enter an email address');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('bare-disabled', () => {
    warnBareDisabled({ disabled: true, component: 'Button' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnBareDisabled({ disabled: true, disabledReason: 'Needs approval' });
    expect(warnSpy).not.toHaveBeenCalled();
    warnBareDisabled({ disabled: true, skip: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('cancel-disabled fires only for a truthy disable', () => {
    warnCancelDisabled({ disabled: true, component: 'ConfirmDialog' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cancel-disabled'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('component=ConfirmDialog'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnCancelDisabled({ disabled: false, component: 'ActionBar' });
    warnCancelDisabled({ component: 'ActionBar' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('dialog-too-many-actions caps at 2 with allowManyActions eject', () => {
    warnDialogTooManyActions({ count: 3, component: 'ActionBar', id: 'dlg' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('count=3'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnDialogTooManyActions({ count: 2, component: 'ActionBar' });
    warnDialogTooManyActions({ count: 1, component: 'ConfirmDialog' });
    warnDialogTooManyActions({ count: 5, allowManyActions: true, component: 'ConfirmDialog' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('select-too-few-options suggests RadioGroup / ToggleGroup', () => {
    warnSelectTooFewOptions({ count: 3, component: 'Select' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('select-too-few-options'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('suggest=RadioGroup'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnSelectTooFewOptions({ count: 2 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('suggest=ToggleGroup'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnSelectTooFewOptions({ count: 6 });
    warnSelectTooFewOptions({ count: 3, multiple: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('positive-tabindex', () => {
    warnPositiveTabIndex({ value: 2, component: 'Button' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('positive-tabindex'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnPositiveTabIndex({ value: 0 });
    warnPositiveTabIndex({ value: -1 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tooltip-on-disabled', () => {
    warnTooltipOnDisabled({ childDisabled: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tooltip-on-disabled'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnTooltipOnDisabled({ childDisabled: false });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('outline-none', () => {
    warnOutlineNone({ outlineStyle: 'none' }, { component: 'Input.Box' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outline-none'));
    __resetDevWarnSeen();
    warnSpy.mockClear();
    warnOutlineNone({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
