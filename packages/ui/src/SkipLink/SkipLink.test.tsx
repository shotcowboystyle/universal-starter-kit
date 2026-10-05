import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SkipLink } from './index';

function renderWithTarget() {
  return renderWithProviders(
    <div>
      <SkipLink targetId="main-content">Skip to content</SkipLink>
      <div id="main-content">Main</div>
    </div>,
  );
}

describe('SkipLink', () => {
  it('renders an anchor pointing at the target id', () => {
    const { container } = renderWithTarget();
    const anchor = container.querySelector('a[href="#main-content"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.textContent).toContain('Skip to content');
  });

  it('is a real hash link with the skip-link class (GOV.UK / Primer)', () => {
    const { container } = renderWithTarget();
    const anchor = container.querySelector('a.mp-skip-link') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.getAttribute('href')).toBe('#main-content');
    expect(anchor.closest('nav')).toBeNull();
    expect(document.getElementById('mp-skip-link-css')?.textContent).toContain(':focus-visible');
    expect(document.getElementById('mp-skip-link-css')?.textContent).toContain('outline-offset');
  });

  it('moves focus to the target on activation', () => {
    const { container } = renderWithTarget();
    const anchor = container.querySelector('a[href="#main-content"]') as HTMLElement;
    fireEvent.click(anchor);
    const target = document.getElementById('main-content') as HTMLElement;
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(target);
  });

  it('strips the temporary tabindex and target class on blur (GOV.UK VoiceOver)', () => {
    const { container } = renderWithTarget();
    fireEvent.click(container.querySelector('a[href="#main-content"]') as HTMLElement);
    const target = document.getElementById('main-content') as HTMLElement;
    expect(target.classList.contains('mp-skip-link-target')).toBe(true);
    fireEvent.blur(target);
    expect(target.hasAttribute('tabindex')).toBe(false);
    expect(target.classList.contains('mp-skip-link-target')).toBe(false);
  });

  it('does not strip an existing tabindex on the target', () => {
    const { container } = renderWithProviders(
      <div>
        <SkipLink targetId="kept">Skip</SkipLink>
        <div id="kept" tabIndex={-1}>
          Kept
        </div>
      </div>,
    );
    const target = document.getElementById('kept') as HTMLElement;
    fireEvent.click(container.querySelector('a[href="#kept"]') as HTMLElement);
    fireEvent.blur(target);
    expect(target.getAttribute('tabindex')).toBe('-1');
  });

  it('paints the skip label at weight 400', () => {
    const { container } = renderWithTarget();
    const label = container.querySelector('a.mp-skip-link')?.querySelector('span, p, div');
    const node = (label ?? container.querySelector('a.mp-skip-link')) as HTMLElement;
    expect(node).toBeTruthy();
    const weight = node.style.fontWeight || getComputedStyle(node).fontWeight;
    expect(['400', 'normal']).toContain(String(weight));
  });

  it('reports the focused target through onSkip', () => {
    const onSkip = vi.fn();
    const { container } = renderWithProviders(
      <div>
        <SkipLink targetId="content-x" onSkip={onSkip}>
          Skip
        </SkipLink>
        <div id="content-x">X</div>
      </div>,
    );
    fireEvent.click(container.querySelector('a[href="#content-x"]') as HTMLElement);
    expect(onSkip).toHaveBeenCalledWith(document.getElementById('content-x'));
  });
});
