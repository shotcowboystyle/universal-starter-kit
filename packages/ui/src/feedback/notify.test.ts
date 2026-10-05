import { afterEach, describe, expect, it, vi } from 'vitest';

import { getToasts, resetToasts, TOAST_ACTION_MIN_MS } from '../Toast/store';

import { notify } from './notify';
import { routeNotify, type NotifyEvent } from './route';
import { dismissFeedbackByRegion, getFeedback, resetFeedback } from './store';

afterEach(() => {
  resetToasts();
  resetFeedback();
});

const action = { label: 'Retry', onPress: vi.fn() };

function event(partial: Partial<NotifyEvent> & Pick<NotifyEvent, 'severity' | 'scope'>): NotifyEvent {
  return { body: 'Something happened.', ...partial };
}

describe('routeNotify (routing table)', () => {
  it('success → toast (any scope)', () => {
    expect(routeNotify(event({ severity: 'success', scope: 'page' })).surface).toBe('toast');
    expect(routeNotify(event({ severity: 'success', scope: 'field' })).surface).toBe('toast');
    expect(routeNotify(event({ severity: 'success', scope: 'section' })).surface).toBe('toast');
  });

  it('info page → toast; info section/field → inline alert', () => {
    expect(routeNotify(event({ severity: 'info', scope: 'page' })).surface).toBe('toast');
    expect(routeNotify(event({ severity: 'info', scope: 'section' })).surface).toBe('alert');
    expect(routeNotify(event({ severity: 'info', scope: 'field' })).surface).toBe('alert');
  });

  it('error page → banner; error section/field → alert', () => {
    expect(routeNotify(event({ severity: 'error', scope: 'page' })).surface).toBe('banner');
    expect(routeNotify(event({ severity: 'error', scope: 'section' })).surface).toBe('alert');
    expect(routeNotify(event({ severity: 'error', scope: 'field' })).surface).toBe('alert');
  });

  it('error+blocking → dialog (never toast)', () => {
    const route = routeNotify(event({ severity: 'error', scope: 'page', blocking: true }));
    expect(route.surface).toBe('dialog');
    expect(route.duration).toBe(0);
  });

  it('warning+blocking → dialog; warning page → banner', () => {
    expect(routeNotify(event({ severity: 'warning', scope: 'page', blocking: true })).surface).toBe('dialog');
    expect(routeNotify(event({ severity: 'warning', scope: 'page' })).surface).toBe('banner');
  });

  it('blocking is ignored for success/info (stay on toast/alert path)', () => {
    expect(routeNotify(event({ severity: 'success', scope: 'page', blocking: true })).surface).toBe('toast');
    expect(routeNotify(event({ severity: 'info', scope: 'page', blocking: true })).surface).toBe('toast');
  });

  it('errors never auto-dismiss (duration 0 on banner/alert/dialog)', () => {
    for (const scope of ['page', 'section', 'field'] as const) {
      const route = routeNotify(event({ severity: 'error', scope }));
      expect(route.duration).toBe(0);
      expect(route.surface).not.toBe('toast');
    }
    expect(routeNotify(event({ severity: 'error', scope: 'page', blocking: true })).duration).toBe(0);
  });

  it('toast with action gets ≥10s duration', () => {
    const route = routeNotify(event({ severity: 'success', scope: 'page', action }));
    expect(route.surface).toBe('toast');
    expect(route.duration).toBe(TOAST_ACTION_MIN_MS);
  });

  it('dismissibility gate: error banners are NOT dismissible; warning banners are', () => {
    expect(routeNotify(event({ severity: 'error', scope: 'page' })).dismissible).toBe(false);
    expect(routeNotify(event({ severity: 'warning', scope: 'page' })).dismissible).toBe(true);
  });

  it('dismissibility gate: info/success surfaces stay dismissible', () => {
    expect(routeNotify(event({ severity: 'info', scope: 'page' })).dismissible).toBe(true);
    expect(routeNotify(event({ severity: 'info', scope: 'section' })).dismissible).toBe(true);
    expect(routeNotify(event({ severity: 'success', scope: 'page' })).dismissible).toBe(true);
  });

  it('dismissibility gate: explicit dismissible ejects the error-banner gate', () => {
    expect(routeNotify(event({ severity: 'error', scope: 'page', dismissible: true })).dismissible).toBe(true);
    expect(routeNotify(event({ severity: 'warning', scope: 'page', dismissible: false })).dismissible).toBe(false);
  });

  it('maps info → accent toast intent', () => {
    expect(routeNotify(event({ severity: 'info', scope: 'page' })).toastIntent).toBe('accent');
    expect(routeNotify(event({ severity: 'success', scope: 'page' })).toastIntent).toBe('success');
    expect(routeNotify(event({ severity: 'error', scope: 'page' })).toastIntent).toBe('error');
  });
});

describe('notify() delivery', () => {
  it('targets and clears one inline region without disturbing another', () => {
    const route = notify({
      severity: 'error',
      scope: 'field',
      region: 'first',
      body: 'First failed',
    });
    notify({ severity: 'error', scope: 'field', region: 'second', body: 'Second failed' });
    expect(route.region).toBe('first');
    expect(getFeedback().map((entry) => entry.region)).toEqual(['first', 'second']);
    dismissFeedbackByRegion('first');
    expect(getFeedback().map((entry) => entry.region)).toEqual(['second']);
  });

  it('success path shows a one-liner toast', () => {
    const route = notify({
      severity: 'success',
      scope: 'page',
      body: 'Customer record updated.',
    });
    expect(route.surface).toBe('toast');
    const toasts = getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.title).toBe('Customer record updated.');
    expect(toasts[0]?.intent).toBe('success');
    expect(getFeedback()).toHaveLength(0);
  });

  it('success with title+body puts body in description', () => {
    notify({
      severity: 'success',
      scope: 'page',
      title: 'Saved',
      body: 'Customer record updated.',
    });
    expect(getToasts()[0]?.title).toBe('Saved');
    expect(getToasts()[0]?.description).toBe('Customer record updated.');
  });

  it('error page pushes a sticky banner (not toast)', () => {
    const route = notify({
      severity: 'error',
      scope: 'page',
      title: 'Save failed',
      body: 'The server rejected the request.',
    });
    expect(route.surface).toBe('banner');
    expect(getToasts()).toHaveLength(0);
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0]?.surface).toBe('banner');
    expect(getFeedback()[0]?.severity).toBe('error');
    // House gate: error banner carries dismissible=false into the store.
    expect(getFeedback()[0]?.dismissible).toBe(false);
  });

  it('error+blocking pushes a dialog', () => {
    const route = notify({
      severity: 'error',
      scope: 'page',
      blocking: true,
      title: 'Payment failed',
      body: 'Your card was declined.',
      action,
    });
    expect(route.surface).toBe('dialog');
    expect(getFeedback()[0]?.surface).toBe('dialog');
    expect(getToasts()).toHaveLength(0);
  });

  it('section info pushes an inline alert', () => {
    const route = notify({
      severity: 'info',
      scope: 'section',
      body: 'Review the shipping address.',
    });
    expect(route.surface).toBe('alert');
    expect(getFeedback()[0]?.scope).toBe('section');
  });

  it('action toast duration is enforced at delivery (≥10s)', () => {
    notify({
      severity: 'success',
      scope: 'page',
      body: 'Archived.',
      action,
    });
    expect(getToasts()[0]?.duration).toBeGreaterThanOrEqual(TOAST_ACTION_MIN_MS);
  });
});
