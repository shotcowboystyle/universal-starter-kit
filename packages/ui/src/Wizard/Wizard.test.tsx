import { Form, Input, Switch, useFormContext } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen } from '@repo/theme';
import { act, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Wizard, useWizard, type WizardFormLike, type WizardStep } from './index';

const STEPS: WizardStep[] = [
  { id: 'identity', label: 'Identity', fields: ['name'], fieldLabels: { name: 'Name' } },
  { id: 'sprites', label: 'Sprites', fields: ['url'], fieldLabels: { url: 'URL' } },
  { id: 'review', label: 'Review', review: true },
];

interface HarnessProps {
  onStore?: (form: WizardFormLike) => void;
  onComplete?: () => void;
  labels?: 'visible' | 'hidden' | 'auto';
}

function ClearStep() {
  const { setFieldValue } = useWizard();
  return (
    <>
      <Switch
        id="derive"
        name="derive"
        label="Derive URL"
        onChange={(checked: boolean) => {
          if (checked) {
            setFieldValue('url', '');
          }
        }}
      />
      <Wizard.Clearable names={['url']}>
        <Input id="url" name="url" label="URL" />
      </Wizard.Clearable>
    </>
  );
}

function WizardInner({ onStore, onComplete, labels }: HarnessProps) {
  const form = useFormContext<Record<string, string>>();
  useEffect(() => {
    onStore?.(form as unknown as WizardFormLike);
  }, [form, onStore]);
  return (
    <Wizard
      form={form as unknown as WizardFormLike}
      steps={STEPS}
      completeLabel="Restore backup"
      labels={labels ?? 'visible'}
      onCancel={() => undefined}
      onComplete={onComplete}>
      <Wizard.Panel>
        <Input id="name" name="name" label="Name" required />
      </Wizard.Panel>
      <Wizard.Panel>
        <ClearStep />
      </Wizard.Panel>
      <Wizard.Panel>
        <Wizard.Review />
      </Wizard.Panel>
    </Wizard>
  );
}

function renderWizard(props: HarnessProps = {}) {
  const store: { form?: WizardFormLike } = {};
  const view = renderWithProviders(
    <Form
      formOptions={{
        defaultValues: { name: '', url: 'https://old.example', derive: false },
      }}
      showErrorSummary={false}>
      <WizardInner
        {...props}
        onStore={(form) => {
          store.form = form;
          props.onStore?.(form);
        }}
      />
    </Form>,
  );
  return { ...view, store };
}

function panelDisplay(el: Element) {
  const html = el as HTMLElement;
  return html.style.display || getComputedStyle(html).display;
}

describe('Wizard mounted panels and validation', () => {
  it('wizard probe: fill step 1, advance, return — DOM and store match', async () => {
    const { container, store } = renderWizard();
    const name = container.querySelector('#name') as HTMLInputElement;
    expect(name).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Pikachu' } });
    fireEvent.input(name, { target: { value: 'Pikachu' } });

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']") as Element);
    });

    const shell = container.querySelector('[data-wizard-shell]') as HTMLElement;
    expect(shell.getAttribute('data-wizard-current')).toBe('1');

    const hidden = [...container.querySelectorAll('[data-wizard-panel][data-active="false"]')] as HTMLElement[];
    expect(hidden.length).toBe(2);
    for (const panel of hidden) {
      expect(panelDisplay(panel) === 'none' || panel.getAttribute('data-active') === 'false').toBe(true);
      expect(panel.isConnected).toBe(true);
    }

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-back']") as Element);
    });

    const nameAgain = container.querySelector('#name') as HTMLInputElement;
    expect(nameAgain.value).toBe('Pikachu');
    expect(store.form?.getFieldValue?.('name')).toBe('Pikachu');
    expect(container.querySelector('[data-wizard-shell]')?.getAttribute('data-wizard-current')).toBe('0');
  });

  it('clear probe: derived-value toggle clears visible value and store', async () => {
    const { container, store } = renderWizard();
    const name = container.querySelector('#name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Pikachu' } });
    fireEvent.input(name, { target: { value: 'Pikachu' } });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']") as Element);
    });

    const url = container.querySelector('#url') as HTMLInputElement;
    expect(url.value).toBe('https://old.example');
    expect(store.form?.getFieldValue?.('url')).toBe('https://old.example');

    const derive = container.querySelector('#derive') as HTMLElement;
    expect(derive).toBeTruthy();
    await act(async () => {
      fireEvent.click(derive);
    });

    const urlAfter = container.querySelector('#url') as HTMLInputElement;
    expect(urlAfter.value).toBe('');
    expect(store.form?.getFieldValue?.('url')).toBe('');

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']") as Element);
    });
    expect({
      name: store.form?.getFieldValue?.('name'),
      url: store.form?.getFieldValue?.('url'),
    }).toEqual({ name: 'Pikachu', url: '' });
  });

  it('per-step validation blocks advance and focuses the first invalid field', async () => {
    const { container } = renderWizard();
    const primary = container.querySelector("[data-testid='wizard-primary']") as HTMLButtonElement;
    expect(primary.getAttribute('aria-disabled')).not.toBe('true');
    expect(primary.disabled).toBeFalsy();

    await act(async () => {
      fireEvent.click(primary);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-wizard-shell]')?.getAttribute('data-wizard-current')).toBe('0');
    expect(container.querySelector("[data-testid='error-summary'], [data-error-summary]")).toBeTruthy();
    expect(container.querySelector('[data-step-state="error"]')).toBeTruthy();

    const name = container.querySelector('#name') as HTMLInputElement;
    expect(document.activeElement === name || document.activeElement?.closest?.('#name')).toBeTruthy();
  });

  it('last-step primary is the task verb, never Submit', async () => {
    const { container } = renderWizard();
    const name = container.querySelector('#name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Pikachu' } });
    fireEvent.input(name, { target: { value: 'Pikachu' } });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']") as Element);
    });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']") as Element);
    });
    const primary = container.querySelector("[data-testid='wizard-primary']") as HTMLElement;
    expect(primary.textContent).toBe('Restore backup');
    expect(primary.textContent).not.toMatch(/submit/i);
    expect(container.querySelector('[data-primary]')).toBe(primary);
  });

  it('hides rail labels at labels=hidden and keeps the step caption', () => {
    const { container } = renderWizard({ labels: 'hidden' });
    expect(container.querySelector("[data-labels='hidden']")).toBeTruthy();
    expect(container.querySelector('[data-wizard-step-caption]')?.textContent).toContain('Step 1 of 3');
    const rail = container.querySelector('[data-wizard-rail]');
    expect(rail?.textContent).not.toContain('Identity');
  });
});

describe('Wizard guardrail-clean at rest', () => {
  it('a ready wizard at rest emits zero [theme] guardrail warnings', async () => {
    __resetDevWarnSeen();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderWizard();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const themeWarns = [...warn.mock.calls, ...error.mock.calls]
        .map((args) => String(args[0]))
        .filter((msg) => msg.startsWith('[theme]'));
      expect(themeWarns).toEqual([]);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('Wizard states', () => {
  it('draws loading, empty, and error shells', () => {
    const loading = renderWithProviders(<Wizard steps={STEPS} completeLabel="Restore backup" status="loading" />);
    expect(loading.container.querySelector("[data-wizard-status='loading']")).toBeTruthy();
    expect(loading.container.querySelector('[data-skeleton]')).toBeTruthy();

    const empty = renderWithProviders(<Wizard steps={STEPS} completeLabel="Restore backup" status="empty" />);
    expect(empty.container.querySelector("[data-wizard-status='empty']")).toBeTruthy();

    const error = renderWithProviders(<Wizard steps={STEPS} completeLabel="Restore backup" status="error" />);
    expect(error.container.querySelector("[data-wizard-status='error']")).toBeTruthy();
  });
});
