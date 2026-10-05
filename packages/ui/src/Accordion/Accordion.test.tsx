import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Accordion } from './index';

function atoms(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function renderAccordion(props: Record<string, any> = {}) {
  return renderWithProviders(
    <Accordion {...props}>
      <Accordion.Item value="a">
        <Accordion.Trigger>Section A</Accordion.Trigger>
        <Accordion.Content>
          <Text>Content A</Text>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="b">
        <Accordion.Trigger>Section B</Accordion.Trigger>
        <Accordion.Content>
          <Text>Content B</Text>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>,
  );
}

function getTriggers(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[aria-expanded]'));
}

describe('Accordion', () => {
  it('renders headers with collapsed content', () => {
    const result = renderAccordion();
    const triggers = getTriggers(result.container);
    expect(triggers).toHaveLength(2);
    expect(triggers[0].getAttribute('aria-expanded')).toBe('false');
    expect(result.container.textContent).not.toContain('Content A');
  });

  it('opens on click and fires onValueChange', () => {
    const onValueChange = vi.fn();
    const result = renderAccordion({ onValueChange });
    const triggers = getTriggers(result.container);
    fireEvent.click(triggers[0]);
    expect(onValueChange).toHaveBeenCalledWith('a');
    expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
    expect(result.container.textContent).toContain('Content A');
  });

  it('single mode closes the previous item when another opens', () => {
    const result = renderAccordion({ defaultValue: 'a' });
    const triggers = getTriggers(result.container);
    expect(result.container.textContent).toContain('Content A');
    fireEvent.click(triggers[1]);
    expect(result.container.textContent).not.toContain('Content A');
    expect(result.container.textContent).toContain('Content B');
  });

  it('single mode is collapsible by default', () => {
    const result = renderAccordion({ defaultValue: 'a' });
    const triggers = getTriggers(result.container);
    fireEvent.click(triggers[0]);
    expect(triggers[0].getAttribute('aria-expanded')).toBe('false');
    expect(result.container.textContent).not.toContain('Content A');
  });

  it('multiple mode keeps several items open', () => {
    const result = renderAccordion({ type: 'multiple', defaultValue: ['a'] });
    const triggers = getTriggers(result.container);
    fireEvent.click(triggers[1]);
    expect(result.container.textContent).toContain('Content A');
    expect(result.container.textContent).toContain('Content B');
  });

  it('controlled value wins and does not self-mutate', () => {
    const onValueChange = vi.fn();
    const result = renderAccordion({ value: 'a', onValueChange });
    const triggers = getTriggers(result.container);
    expect(result.container.textContent).toContain('Content A');
    fireEvent.click(triggers[1]);
    expect(onValueChange).toHaveBeenCalledWith('b');
    // still controlled to "a"
    expect(result.container.textContent).toContain('Content A');
    expect(result.container.textContent).not.toContain('Content B');
  });

  it('wires aria-controls to an existing content id', () => {
    const result = renderAccordion({ defaultValue: 'a' });
    const triggers = getTriggers(result.container);
    const controls = triggers[0].getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const content = result.container.querySelector(`[id="${controls}"]`);
    expect(content).not.toBeNull();
    expect(content?.getAttribute('aria-labelledby')).toBe(triggers[0].id);
    expect(content?.getAttribute('role')).toBe('region');
  });

  it('marks first and last stacked-group positions on triggers', () => {
    const result = renderAccordion();
    const triggers = getTriggers(result.container);
    expect(triggers[0].getAttribute('data-group-position')).toBe('first');
    expect(triggers[1].getAttribute('data-group-position')).toBe('last');
  });

  it('marks the open trigger as selected', () => {
    const result = renderAccordion({ defaultValue: 'a' });
    const triggers = getTriggers(result.container);
    expect(triggers[0].getAttribute('data-selected')).toBe('true');
    expect(triggers[1].getAttribute('data-selected')).toBeNull();
  });

  it('nested accordion steps density down', () => {
    const result = renderWithProviders(
      <Accordion defaultValue="outer">
        <Accordion.Item value="outer">
          <Accordion.Trigger>Outer</Accordion.Trigger>
          <Accordion.Content>
            <Accordion defaultValue="inner">
              <Accordion.Item value="inner">
                <Accordion.Trigger>Inner</Accordion.Trigger>
                <Accordion.Content>Nested body</Accordion.Content>
              </Accordion.Item>
            </Accordion>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const levels = Array.from(result.container.querySelectorAll('[data-accordion-level]'));
    expect(levels[0]?.getAttribute('data-accordion-level')).toBe('1');
    expect(levels[1]?.getAttribute('data-accordion-level')).toBe('2');
    expect(levels[1]?.getAttribute('data-density')).toBe('compact');
  });

  it('disabled item does not toggle', () => {
    const onValueChange = vi.fn();
    const result = renderWithProviders(
      <Accordion onValueChange={onValueChange}>
        <Accordion.Item value="a" disabled>
          <Accordion.Trigger>Section A</Accordion.Trigger>
          <Accordion.Content>
            <Text>Content A</Text>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const trigger = getTriggers(result.container)[0];
    fireEvent.click(trigger);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(result.container.textContent).not.toContain('Content A');
  });

  it('puts data-testid, data-density and data-size on the root', () => {
    const result = renderAccordion({ compact: true });
    const root = result.container.querySelector('[data-testid="accordion"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute('data-density')).toBe('compact');
    expect(root.getAttribute('data-size')).toBeTruthy();
  });
});

describe('Accordion labels — weight 400 on the TEXT NODE', () => {
  afterEach(cleanup);

  it('measures the trigger title on the text node, never the row', () => {
    const result = renderAccordion();
    const trigger = getTriggers(result.container)[0];
    const textNode = screen.getByText('Section A');
    expect(textNode).not.toBe(trigger);
    const weight = atoms(textNode, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
    expect(atoms(trigger, ['_fow-'])).toHaveLength(0);
  });

  it('keeps the description at weight 400 on its text node', () => {
    renderWithProviders(
      <Accordion>
        <Accordion.Item value="a">
          <Accordion.Trigger description="Where should we deliver?">Shipping</Accordion.Trigger>
          <Accordion.Content>Body</Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const textNode = screen.getByText('Where should we deliver?');
    const weight = atoms(textNode, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });
});

describe('Accordion density — pad and gap move, control height holds', () => {
  afterEach(cleanup);

  const padX = ['_px-', '_pl-', '_pr-'];
  const gap = ['_gap-'];
  const height = ['_h-', '_mih-', '_mah-'];

  it('density knob restyles trigger pad/gap without changing minHeight', () => {
    const comfortable = renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <Accordion>
          <Accordion.Item value="a">
            <Accordion.Trigger>Section A</Accordion.Trigger>
            <Accordion.Content>Body</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Preset>,
    );
    const comfortableRoot = comfortable.container.querySelector('[data-testid="accordion"]') as HTMLElement;
    const comfortableTrigger = getTriggers(comfortable.container)[0];
    const comfortableMeasure = {
      density: comfortableRoot.getAttribute('data-density'),
      padX: atoms(comfortableTrigger, padX),
      gap: atoms(comfortableTrigger, gap),
      height: atoms(comfortableTrigger, height),
    };
    cleanup();

    const compact = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Accordion>
          <Accordion.Item value="a">
            <Accordion.Trigger>Section A</Accordion.Trigger>
            <Accordion.Content>Body</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Preset>,
    );
    const compactRoot = compact.container.querySelector('[data-testid="accordion"]') as HTMLElement;
    const compactTrigger = getTriggers(compact.container)[0];
    expect(comfortableMeasure.density).toBe('comfortable');
    expect(compactRoot.getAttribute('data-density')).toBe('compact');
    expect(comfortableMeasure.padX.length).toBeGreaterThan(0);
    expect(atoms(compactTrigger, padX)).not.toEqual(comfortableMeasure.padX);
    expect(comfortableMeasure.gap.length).toBeGreaterThan(0);
    expect(atoms(compactTrigger, gap)).not.toEqual(comfortableMeasure.gap);
    expect(atoms(compactTrigger, height)).toEqual(comfortableMeasure.height);
  });
  it('survives the animation knob flipping live from none to bouncy', () => {
    const Flip = ({ animation }: { animation: 'none' | 'bouncy' }) => (
      <Preset overrides={{ animation }}>
        <Accordion defaultValue="a">
          <Accordion.Item value="a">
            <Accordion.Trigger>Section A</Accordion.Trigger>
            <Accordion.Content>
              <Text>Content A</Text>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Preset>
    );
    const { container, rerender } = renderWithProviders(<Flip animation="none" />);
    expect(container.textContent).toContain('Content A');

    expect(() => {
      rerender(<Flip animation="bouncy" />);
    }).not.toThrow();
    expect(container.textContent).toContain('Content A');
    expect(getTriggers(container)[0].getAttribute('aria-expanded')).toBe('true');
  });
});
