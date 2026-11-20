import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FieldGroup } from './FieldGroup';
import { formFieldGap, formReadableMaxWidth, formSectionGap } from './form-spacing';
import { FORM_GRID_COLLAPSE_WIDTH, FormGrid } from './FormGrid';
import { FormSection, FormSectionStack } from './FormSection';

const restoreStubs = () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
};

const stubContainerWidth = (width: number) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 100,
    top: 0,
    left: 0,
    right: width,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly #notify: ResizeObserverCallback;
      readonly unobserve = vi.fn<() => void>();
      readonly disconnect = vi.fn<() => void>();
      constructor(notify: ResizeObserverCallback) {
        this.#notify = notify;
      }
      observe(target: Element) {
        this.#notify(
          [
            {
              target,
              contentRect: { width } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
    },
  );
};

describe('formSpacing tokens', () => {
  afterEach(restoreStubs);

  it('encodes section gap larger than field gap', () => {
    expect(formFieldGap).toBe('$4');
    expect(formSectionGap).toBe('$8');
    expect(Number(formSectionGap.slice(1))).toBeGreaterThan(Number(formFieldGap.slice(1)));
  });

  it('exposes a readable max width in the 480–600 band', () => {
    expect(formReadableMaxWidth).toBeGreaterThanOrEqual(480);
    expect(formReadableMaxWidth).toBeLessThanOrEqual(600);
  });
});

describe(FormGrid, () => {
  afterEach(restoreStubs);

  it('defaults to a single column', () => {
    const result = renderWithProviders(
      <FormGrid>
        <div>a</div>
        <div>b</div>
      </FormGrid>,
    );
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]');
    expect(grid).toBeTruthy();
    expect(grid?.dataset.columns).toBe('1');
    expect(grid?.dataset.requestedColumns).toBe('1');
    expect(grid?.dataset.maxColumns).toBe('2');
    expect(grid?.dataset.gap).toBe('$4');
    expect(grid?.dataset.density).toBe('comfortable');
    expect(grid?.dataset.size).toBe('medium');
  });

  it('caps columns at maxColumns', () => {
    stubContainerWidth(720);
    const result = renderWithProviders(
      <FormGrid
        columns={2}
        maxColumns={1}>
        <div>a</div>
        <div>b</div>
      </FormGrid>,
    );
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]');
    expect(grid?.dataset.requestedColumns).toBe('1');
    expect(grid?.dataset.columns).toBe('1');
  });

  it('uses 2 columns when requested and container is wide', () => {
    stubContainerWidth(FORM_GRID_COLLAPSE_WIDTH + 40);
    let result!: ReturnType<typeof renderWithProviders>;
    act(() => {
      result = renderWithProviders(
        <FormGrid columns={2}>
          <div>a</div>
          <div>b</div>
        </FormGrid>,
      );
    });
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]')!;
    expect(grid.dataset.requestedColumns).toBe('2');
    expect(grid.dataset.columns).toBe('2');
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('collapses to 1 column when container is narrow', () => {
    stubContainerWidth(280);
    let result!: ReturnType<typeof renderWithProviders>;
    act(() => {
      result = renderWithProviders(
        <FormGrid columns={2}>
          <div>a</div>
          <div>b</div>
        </FormGrid>,
      );
    });
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]')!;
    expect(grid.dataset.requestedColumns).toBe('2');
    expect(grid.dataset.columns).toBe('1');
    expect(grid.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
  });

  it('gap follows the space recipe, not sizeToken (density≠size)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ size: 'large', space: 'small' }}>
        <FormGrid>
          <div>a</div>
        </FormGrid>
      </Preset>,
    );
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]');
    expect(grid?.dataset.gap).toBe('$2');
    expect(grid?.dataset.size).toBe('large');
  });

  it('compact steps space down without reading sizeToken as gap', () => {
    const result = renderWithProviders(
      <FormGrid compact>
        <div>a</div>
      </FormGrid>,
    );
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]');
    expect(grid?.dataset.density).toBe('compact');
    expect(grid?.dataset.size).toBe('medium');
    expect(grid?.dataset.gap).toBe('$2');
  });

  it('spreads the space-recipe gap fragment (not a raw 16)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ space: 'large' }}>
        <FormGrid>
          <div>a</div>
        </FormGrid>
      </Preset>,
    );
    const grid = result.container.querySelector<HTMLElement>('[data-mpo-form-grid]');
    expect(grid?.dataset.gap).toBe('$5');
  });
});

describe(FieldGroup, () => {
  afterEach(restoreStubs);

  it('renders a fieldset legend on web', () => {
    const result = renderWithProviders(
      <FieldGroup legend="Billing">
        <div>card</div>
      </FieldGroup>,
    );
    const fieldset = result.container.querySelector('fieldset[data-mpo-field-group]');
    expect(fieldset).toBeTruthy();
    expect(result.container.querySelector('legend')?.textContent).toBe('Billing');
  });

  it('uses FormGrid when columns=2', () => {
    stubContainerWidth(720);
    const result = renderWithProviders(
      <FieldGroup
        legend="Name"
        columns={2}>
        <div>first</div>
        <div>last</div>
      </FieldGroup>,
    );
    expect(result.container.querySelector('[data-mpo-form-grid]')).toBeTruthy();
    expect(result.container.querySelector<HTMLElement>('[data-mpo-field-group]')?.dataset.columns).toBe('2');
  });

  it('field gap follows space, not size (density≠size)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ size: 'large', space: 'small' }}>
        <FieldGroup legend="Billing">
          <div>card</div>
        </FieldGroup>
      </Preset>,
    );
    const group = result.container.querySelector<HTMLElement>('[data-mpo-field-group]');
    expect(group?.dataset.fieldGap).toBe('$2');
    expect(group?.dataset.size).toBe('large');
  });
});

describe(FormSection, () => {
  afterEach(restoreStubs);

  it('renders label and section marker', () => {
    const result = renderWithProviders(
      <FormSection label="Details">
        <div>field</div>
      </FormSection>,
    );
    expect(result.container.querySelector('[data-mpo-form-section]')).toBeTruthy();
    expect(result.findTextElement('Details')).toBeDefined();
  });

  it('allows fluid max width', () => {
    const result = renderWithProviders(
      <FormSection
        label="Wide"
        maxWidth="fluid">
        <div>field</div>
      </FormSection>,
    );
    expect(result.container.querySelector('[data-mpo-form-section]')).toBeTruthy();
  });

  it('FormSectionStack marks section rhythm container', () => {
    const result = renderWithProviders(
      <FormSectionStack>
        <FormSection label="A">
          <div>1</div>
        </FormSection>
        <FormSection label="B">
          <div>2</div>
        </FormSection>
      </FormSectionStack>,
    );
    expect(result.container.querySelector('[data-mpo-form-section-stack]')).toBeTruthy();
    expect(result.container.querySelectorAll('[data-mpo-form-section]')).toHaveLength(2);
  });

  it('renders semantic fieldset + legend on web by default', () => {
    const result = renderWithProviders(
      <FormSection label="Billing">
        <div>field</div>
      </FormSection>,
    );
    expect(result.container.querySelector('fieldset')).toBeTruthy();
    expect(result.container.querySelector('legend')?.textContent).toContain('Billing');
    expect(result.container.querySelector('[data-mpo-fieldset]')).toBeTruthy();
  });
});

describe('FormSection semantic gaps', () => {
  it('defaults field gap to knobProps.gap and section gap to knobProps.gapLg', () => {
    const result = renderWithProviders(
      <FormSectionStack>
        <FormSection label="A">
          <div>1</div>
        </FormSection>
      </FormSectionStack>,
    );
    const section = result.container.querySelector<HTMLElement>('[data-mpo-form-section]');
    const stack = result.container.querySelector<HTMLElement>('[data-mpo-form-section-stack]');
    // knob defaults: gap $4 (within-group), gapLg $5 (between-groups)
    expect(section?.dataset.fieldGap).toBe('$4');
    expect(stack?.dataset.sectionGap).toBe('$5');
    const fieldStep = Number(section?.dataset.fieldGap?.slice(1));
    const sectionStep = Number(stack?.dataset.sectionGap?.slice(1));
    expect(sectionStep).toBeGreaterThan(fieldStep);
  });

  it('space knob restyles both gaps while keeping section > field', () => {
    const result = renderWithProviders(
      <Preset overrides={{ space: 'small' }}>
        <FormSectionStack>
          <FormSection label="A">
            <div>1</div>
          </FormSection>
        </FormSectionStack>
      </Preset>,
    );
    const section = result.container.querySelector<HTMLElement>('[data-mpo-form-section]');
    const stack = result.container.querySelector<HTMLElement>('[data-mpo-form-section-stack]');
    expect(section?.dataset.fieldGap).toBe('$2');
    expect(stack?.dataset.sectionGap).toBe('$3');
  });

  it('explicit gap props eject from the knob defaults', () => {
    const result = renderWithProviders(
      <FormSectionStack gap="$10">
        <FormSection
          label="A"
          gap="$1">
          <div>1</div>
        </FormSection>
      </FormSectionStack>,
    );
    const section = result.container.querySelector<HTMLElement>('[data-mpo-form-section]');
    const stack = result.container.querySelector<HTMLElement>('[data-mpo-form-section-stack]');
    expect(section?.dataset.fieldGap).toBe('$1');
    expect(stack?.dataset.sectionGap).toBe('$10');
  });
});
