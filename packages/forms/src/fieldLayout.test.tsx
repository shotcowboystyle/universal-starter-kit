import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { Input as TamaguiInput } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FieldLayout, useFieldDescribedBy } from './fieldLayout';
import { __resetDevWarnSeen } from './shared/devWarn';

function classIncludes(container: HTMLElement, fragment: string): boolean {
  return Array.from(container.querySelectorAll('[class]')).some((el) =>
    (el.getAttribute('class') ?? '').includes(fragment),
  );
}

describe('FieldLayout width-by-purpose', () => {
  it('applies maxWidth from purpose', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="zip" label="ZIP" purpose="postalCode">
        <TamaguiInput id="zip" />
      </FieldLayout>,
    );
    expect(classIncludes(container, '_maw-12ch')).toBe(true);
  });

  it('applies maxWidth from autoComplete when purpose omitted', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="em" label="Email" autoComplete="email">
        <TamaguiInput id="em" />
      </FieldLayout>,
    );
    expect(classIncludes(container, '_maw-24ch')).toBe(true);
  });

  it('stretches description to full width', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="desc" label="Notes" purpose="description">
        <TamaguiInput id="desc" />
      </FieldLayout>,
    );
    // Tamagui atomic classes: width/maxWidth 100% → `_w-100%` / `_maw-100%`
    // (or a hashed sibling); match the shared `100` token.
    expect(classIncludes(container, '_w-100')).toBe(true);
    expect(classIncludes(container, '_maw-100')).toBe(true);
  });

  it('lets explicit maxWidth eject purpose defaults', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="zip" label="ZIP" purpose="postalCode" maxWidth={200}>
        <TamaguiInput id="zip" />
      </FieldLayout>,
    );
    expect(classIncludes(container, '_maw-12ch')).toBe(false);
    expect(classIncludes(container, '_maw-200px')).toBe(true);
  });
});

describe('FieldLayout placeholder-as-label DEV warn', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('warns when placeholder is set without label or aria-label', () => {
    renderWithProviders(
      <FieldLayout id="x" placeholder="Your name">
        <TamaguiInput id="x" placeholder="Your name" />
      </FieldLayout>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('placeholder-as-label'));
  });

  it('does not warn when a visible label is present', () => {
    renderWithProviders(
      <FieldLayout id="x" label="Name" placeholder="Your name">
        <TamaguiInput id="x" placeholder="Your name" />
      </FieldLayout>,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when aria-label is present', () => {
    renderWithProviders(
      <FieldLayout id="x" placeholder="Search" aria-label="Search documents">
        <TamaguiInput id="x" placeholder="Search" aria-label="Search documents" />
      </FieldLayout>,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when placeholder is omitted', () => {
    renderWithProviders(
      <FieldLayout id="x">
        <TamaguiInput id="x" />
      </FieldLayout>,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('FieldLayout disabledStyle house knob', () => {
  it('keepLabel does not dim the field when disabled', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ disabledStyle: 'keepLabel' }}>
        <FieldLayout id="name" label="Name" disabled>
          <TamaguiInput id="name" disabled />
        </FieldLayout>
      </Preset>,
    );
    const root = container.querySelector("[data-disabled-style='keepLabel']");
    expect(root?.getAttribute('data-disabled-dimmed')).toBe('false');
    expect(container.querySelector('label')?.textContent).toContain('Name');
  });

  it('dimWhole dims the whole field (including label) when disabled', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ disabledStyle: 'dimWhole' }}>
        <FieldLayout id="name" label="Name" disabled>
          <TamaguiInput id="name" disabled />
        </FieldLayout>
      </Preset>,
    );
    const root = container.querySelector("[data-disabled-style='dimWhole']");
    expect(root?.getAttribute('data-disabled-dimmed')).toBe('true');
  });

  it('does not dim when disabledStyle is dimWhole but control is enabled', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ disabledStyle: 'dimWhole' }}>
        <FieldLayout id="name" label="Name">
          <TamaguiInput id="name" />
        </FieldLayout>
      </Preset>,
    );
    const root = container.querySelector("[data-disabled-style='dimWhole']");
    expect(root?.getAttribute('data-disabled-dimmed')).toBe('false');
  });
});

describe('FieldLayout error precedence (Axiom 5 eject-last)', () => {
  function makeField(errors: string[]) {
    return { state: { meta: { errors } } } as any;
  }

  it('explicit error prop wins over field-meta errors', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="p" label="Name" error="Name is taken" field={makeField(['Enter a name'])}>
        <TamaguiInput id="p" />
      </FieldLayout>,
    );
    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toBe('Name is taken');
    expect(container.textContent).not.toContain('Enter a name');
  });

  it('falls back to field-meta errors when no error prop', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="f" label="Name" field={makeField(['Enter a name'])}>
        <TamaguiInput id="f" />
      </FieldLayout>,
    );
    expect(container.querySelector("[role='alert']")?.textContent).toBe('Enter a name');
  });

  it('error={false} ejects: suppresses field-meta errors', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="s" label="Name" error={false} field={makeField(['Enter a name'])}>
        <TamaguiInput id="s" />
      </FieldLayout>,
    );
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.textContent).not.toContain('Enter a name');
  });

  it('error replaces helper in the reserved slot', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="h" label="Name" helperText="Helper" error="Enter a name">
        <TamaguiInput id="h" />
      </FieldLayout>,
    );
    expect(container.querySelector("[role='alert']")?.textContent).toBe('Enter a name');
    expect(container.textContent).not.toContain('Helper');
  });
});

describe('FieldLayout message-before-control anatomy', () => {
  function Control() {
    return <input id="ordered" aria-describedby={useFieldDescribedBy()} />;
  }

  for (const mode of ['top', 'side', 'compact'] as const) {
    it(`${mode}: helper and replacement error precede the control and describe only the rendered slot`, () => {
      const renderField = (error?: string) => (
        <Preset overrides={{ fieldLabelPlacement: mode === 'side' ? 'side' : 'top' }}>
          <FieldLayout
            id="ordered"
            label="Email"
            compactSpacing={mode === 'compact'}
            helperText="Use your work address"
            error={error}>
            <Control />
          </FieldLayout>
        </Preset>
      );
      const result = renderWithProviders(renderField());
      const assertSlot = (id: string, text: string) => {
        const input = result.container.querySelector('input')!;
        const message = result.container.querySelector(`#${id}`)!;
        expect(message.textContent).toBe(text);
        expect(message.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(input.getAttribute('aria-describedby')).toBe(id);
        expect(result.container.querySelectorAll("[id$='-description'], [id$='-error']")).toHaveLength(1);
      };
      assertSlot('ordered-description', 'Use your work address');
      result.rerender(renderField('Enter an email address'));
      assertSlot('ordered-error', 'Enter an email address');
      expect(result.container.textContent).not.toContain('Use your work address');
    });
  }
});

describe('FieldLayout banned-error-word DEV warn', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('warns when error copy uses banned wording', () => {
    renderWithProviders(
      <FieldLayout id="email" label="Email" error="Invalid email, please try again">
        <TamaguiInput id="email" />
      </FieldLayout>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });

  it('is silent for clean error copy', () => {
    renderWithProviders(
      <FieldLayout id="email" label="Email" error="Enter an email address">
        <TamaguiInput id="email" />
      </FieldLayout>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });
});

describe('FieldLayout design-law', () => {
  it('paints the label at weight 400', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="w" label="Name">
        <TamaguiInput id="w" />
      </FieldLayout>,
    );
    const label = container.querySelector('label') as HTMLElement;
    expect(label).toBeTruthy();
    const weight = label.style.fontWeight || getComputedStyle(label).fontWeight;
    expect(['400', 'normal']).toContain(String(weight));
  });

  it('does not pass a control-height sizeToken to the label', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="n" label="Name" size="$10">
        <TamaguiInput id="n" />
      </FieldLayout>,
    );
    const label = container.querySelector('label') as HTMLElement;
    expect(label).toBeTruthy();
    const minH = getComputedStyle(label).minHeight;
    expect(['', '0px', 'auto']).toContain(minH);
  });

  it('side label row spreads the space recipe, not a raw $3', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ space: 'large', fieldLabelPlacement: 'side' }}>
        <FieldLayout id="s" label="Name">
          <TamaguiInput id="s" />
        </FieldLayout>
      </Preset>,
    );
    const row = container.querySelector("[data-label-placement='side'][data-gap]");
    expect(row).toBeTruthy();
    expect(row?.getAttribute('data-gap')).toBe('$5');
  });
});
