/**
 * @vitest-environment jsdom
 *
 * Hide / explain / upgrade — disabledReason renders a real,
 * hover-free affordance (tooltip-on-disabled is banned).
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDevWarnSeen } from '../shared/devWarn';

import { Button } from './index';

describe('Button disabledReason', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('renders the reason as visible text wired via aria-describedby', () => {
    renderWithProviders(
      <Button disabled disabledReason="Needs owner approval">
        Publish
      </Button>,
    );
    const reason = screen.getByText('Needs owner approval');
    expect(reason).toBeInTheDocument();
    expect(reason.getAttribute('data-mp-disabled-reason')).toBe('true');

    const button = screen.getByRole('button');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain('Needs owner approval');
  });

  it('switches to aria-disabled and stays keyboard focusable (no dead end)', () => {
    renderWithProviders(
      <Button disabled disabledReason="Needs owner approval">
        Publish
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('tabindex')).toBe('0');
    expect(button.getAttribute('data-mp-disabled-explained')).toBe('true');
  });

  it('swallows presses while explained-disabled', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <Button disabled disabledReason="Needs owner approval" onPress={onPress}>
        Publish
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not render the reason (and presses work) when enabled', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <Button disabledReason="Needs owner approval" onPress={onPress}>
        Publish
      </Button>,
    );
    expect(screen.queryByText('Needs owner approval')).toBeNull();
    expect(document.querySelector('[data-mp-disabled-reason-wrapper]')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('silences bare-disabled when the reason is present', () => {
    renderWithProviders(
      <Button disabled disabledReason="Needs owner approval">
        Publish
      </Button>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('does not attach a hover-only title to the disabled control', () => {
    renderWithProviders(
      <Button disabled disabledReason="Needs owner approval">
        Publish
      </Button>,
    );
    expect(screen.getByRole('button').getAttribute('title')).toBeNull();
  });
});
