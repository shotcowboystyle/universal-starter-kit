/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Spinner } from './index';

afterEach(cleanup);

function status(container: HTMLElement): HTMLElement {
  return container.querySelector("[role='status']") as HTMLElement;
}

describe('Spinner', () => {
  it('announces as a polite status region and is not a progressbar', () => {
    const { container } = renderWithProviders(<Spinner />);
    const node = status(container);
    expect(node).toBeTruthy();
    expect(node.getAttribute('aria-label')).toBe('Loading');
    expect(node.getAttribute('aria-live')).toBe('polite');
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it('stops spinning when the animation knob is none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Spinner />
      </Preset>,
    );
    expect(status(container).className).toContain('mp1-spinner-static');
  });

  it('keeps spinning with motion on', () => {
    const { container } = renderWithProviders(<Spinner />);
    const node = status(container);
    expect(node.className).toContain('mp1-spinner');
    expect(node.className).not.toContain('mp1-spinner-static');
  });

  it('maps explicit small/large onto the shared size-token scale', () => {
    const small = renderWithProviders(<Spinner size="small" />);
    expect(status(small.container).getAttribute('data-size')).toBe('$1');
    cleanup();
    const large = renderWithProviders(<Spinner size="large" />);
    expect(status(large.container).getAttribute('data-size')).toBe('$3');
  });

  it('publishes data-animation=none when the animation knob is none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Spinner />
      </Preset>,
    );
    expect(status(container).getAttribute('data-animation')).toBe('none');
  });

  it('publishes data-animation=spin with motion on', () => {
    const { container } = renderWithProviders(<Spinner />);
    expect(status(container).getAttribute('data-animation')).toBe('spin');
  });

  it('follows the size knob when size is omitted', () => {
    const small = renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Spinner />
      </Preset>,
    );
    expect(status(small.container).getAttribute('data-size')).toBe('$3');
    cleanup();
    const large = renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Spinner />
      </Preset>,
    );
    expect(status(large.container).getAttribute('data-size')).toBe('$5');
  });
});
