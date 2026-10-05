import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '../fields/Checkbox';
import { Input } from '../fields/Input';
import { RadioGroup } from '../fields/RadioGroup';
import { Switch } from '../fields/Switch';
import { Form } from '../Form';

import { clientKnownIdentity, ContextualSaveBar, type NavigationBlocker } from './index';

function savebar(root: ParentNode = document.body): HTMLElement | null {
  return root.querySelector('[data-mp-contextual-savebar]');
}

function barButton(label: string, root: ParentNode = document.body): HTMLElement {
  const buttons = Array.from(root.querySelectorAll('[role="button"], button'));
  const match = buttons.find((b) => b.textContent?.includes(label));
  if (!match) {
    throw new Error(`No button labelled "${label}"`);
  }
  return match as HTMLElement;
}

function alertdialog(): HTMLElement | null {
  return document.body.querySelector('[role="alertdialog"]');
}

function typeIn(input: Element, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('ContextualSaveBar', () => {
  it('does not render when the form is clean', () => {
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { name: 'svc' } }}>
        <Input name="name" label="Service name" />
      </Form>,
    );
    expect(savebar(result.container)).toBeNull();
    expect(result.container.textContent).not.toContain('Unsaved changes');
  });

  it('appears from TanStack dirty state when a text field is edited', async () => {
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { name: 'svc' } }}>
        <Input name="name" label="Service name" />
      </Form>,
    );
    const input = result.container.querySelector('input');
    expect(input).toBeTruthy();
    await act(async () => {
      typeIn(input!, 'svc-billing');
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
      expect(document.body.textContent).toContain('Unsaved changes');
    });
  });

  it('appears when a checkbox is edited (declarative)', async () => {
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { agree: false } }}>
        <Checkbox name="agree" label="Notify on deploy" />
      </Form>,
    );
    const box = result.getCheckbox();
    expect(box).toBeTruthy();
    await act(async () => {
      fireEvent.click(box!);
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });
  });

  it('appears when a radio is edited (declarative)', async () => {
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { env: 'prod' } }}>
        <RadioGroup
          name="env"
          options={[
            { label: 'Prod', value: 'prod' },
            { label: 'Stage', value: 'stage' },
          ]}
        />
      </Form>,
    );
    const radio = [...result.container.querySelectorAll('[role="radio"]')].find(
      (node) => node.getAttribute('value') === 'stage' || node.id.endsWith('-stage'),
    );
    expect(radio).toBeTruthy();
    await act(async () => {
      fireEvent.click(radio!);
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });
  });

  it('does not appear when a Switch auto-commits', async () => {
    const onAutoCommit = vi.fn();
    const result = renderWithProviders(
      <Form saveBar={{ onAutoCommit }} formOptions={{ defaultValues: { live: false, name: 'svc' } }}>
        <Switch name="live" label="Live" />
        <Input name="name" label="Service name" />
      </Form>,
    );
    const sw = result.getSwitch();
    expect(sw).toBeTruthy();
    await act(async () => {
      fireEvent.click(sw!);
    });
    await waitFor(() => {
      expect(onAutoCommit).toHaveBeenCalledWith('live', true);
    });
    expect(savebar()).toBeNull();
  });

  it.each(['Refused', 'Refused.', 'Refused?', 'Refused!', 'Refused。'])(
    'separates refusal copy once for %s',
    async (refusal) => {
      const result = renderWithProviders(
        <Form
          saveBar
          formOptions={{ defaultValues: { name: 'svc' } }}
          onSubmit={async () => {
            throw new Error(refusal);
          }}>
          <Input name="name" label="Name" />
        </Form>,
      );
      await act(async () => {
        typeIn(result.container.querySelector('input')!, 'other');
      });
      await act(async () => fireEvent.click(barButton('Save')));
      const displayed = /[.!?。]$/u.test(refusal) ? refusal : `${refusal}.`;
      await waitFor(() => {
        expect(savebar()?.textContent).toContain(`${displayed} Edits are kept on this page.`);
      });
    },
  );

  it.each([undefined, 'Review changes'])(
    'shows the complete narrow-form refusal with custom status %s',
    async (message) => {
      const refusal =
        'service_identifier_already_exists_012345678901234567890123456789. Choose a different identifier and retry.';
      const result = renderWithProviders(
        <div style={{ width: 309 }}>
          <Form
            saveBar={{ message }}
            formOptions={{ defaultValues: { name: 'svc' } }}
            onSubmit={async () => {
              throw new Error(refusal);
            }}>
            <Input name="name" label="Service name" />
          </Form>
        </div>,
      );
      const input = result.container.querySelector('input')!;
      await act(async () => {
        typeIn(input, 'svc-billing');
      });
      await act(async () => fireEvent.click(barButton('Save')));
      await waitFor(() => {
        expect(savebar()?.textContent).toContain(refusal);
      });
      expect(savebar()?.textContent).not.toContain('retry..');
      const status = savebar()!.querySelector('[role="status"]')!;
      expect(getComputedStyle(status).whiteSpace).not.toBe('nowrap');
      expect(getComputedStyle(status).textOverflow).not.toBe('ellipsis');
      expect(getComputedStyle(status).overflowWrap).toBe('anywhere');
      expect(getComputedStyle(savebar()!).flexDirection).toBe('column');
      expect(barButton('Save').getAttribute('aria-disabled')).toBeNull();
      expect(barButton('Discard').getAttribute('aria-disabled')).toBeNull();
      expect(input.value).toBe('svc-billing');
    },
  );

  it('clears after Save and after Discard confirm', async () => {
    const onSubmit = vi.fn();
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { name: 'svc' } }} onSubmit={onSubmit}>
        <Input name="name" label="Service name" />
      </Form>,
    );
    const input = result.container.querySelector('input')!;
    await act(async () => {
      typeIn(input, 'svc-billing');
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(barButton('Save'));
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: 'svc-billing' });
      expect(savebar()).toBeNull();
    });

    await act(async () => {
      typeIn(input, 'svc-other');
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(barButton('Discard'));
    });
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    expect(alertdialog()?.textContent).toContain('Discard unsaved changes?');

    await act(async () => {
      fireEvent.click(barButton('Keep editing'));
    });
    await waitFor(() => {
      expect(alertdialog()).toBeNull();
    });
    expect(savebar()).toBeTruthy();
    expect(input.value).toBe('svc-other');

    await act(async () => {
      fireEvent.click(barButton('Discard'));
    });
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(barButton('Discard changes'));
    });
    await waitFor(() => {
      expect(alertdialog()).toBeNull();
      expect(savebar()).toBeNull();
    });
    expect(input.value).toBe('svc-billing');
  });

  it('never disables Discard while Save is in flight', async () => {
    let finish!: () => void;
    const hang = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = renderWithProviders(
      <Form saveBar formOptions={{ defaultValues: { name: 'svc' } }} onSubmit={() => hang}>
        <Input name="name" label="Service name" />
      </Form>,
    );
    await act(async () => {
      typeIn(result.container.querySelector('input')!, 'svc-billing');
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(barButton('Save'));
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Saving');
    });
    const discard = barButton('Discard');
    expect(discard.getAttribute('disabled')).toBeNull();
    expect(discard.getAttribute('aria-disabled')).toBeNull();
    expect(discard.getAttribute('data-disabled')).toBeNull();
    finish();
  });

  it('fires the route-leave guard and Keep editing dismisses it', async () => {
    function Harness() {
      const [leaveArmed, setLeaveArmed] = useState(false);
      const useBlocker = (shouldBlock: boolean): NavigationBlocker => {
        if (leaveArmed && shouldBlock) {
          return {
            state: 'blocked',
            proceed: () => {
              setLeaveArmed(false);
            },
            reset: () => {
              setLeaveArmed(false);
            },
          };
        }
        return { state: 'unblocked', proceed: () => {}, reset: () => {} };
      };
      return (
        <>
          <button
            type="button"
            data-testid="leave"
            onClick={() => {
              setLeaveArmed(true);
            }}>
            Leave
          </button>
          <Form saveBar={{ useBlocker }} formOptions={{ defaultValues: { name: 'svc' } }}>
            <Input name="name" label="Service name" />
          </Form>
        </>
      );
    }

    const result = renderWithProviders(<Harness />);
    await act(async () => {
      typeIn(result.container.querySelector('input')!, 'svc-billing');
    });
    await waitFor(() => {
      expect(savebar()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(result.container.querySelector('[data-testid="leave"]')!);
    });
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(barButton('Keep editing'));
    });
    await waitFor(() => {
      expect(alertdialog()).toBeNull();
    });
    expect(savebar()).toBeTruthy();
  });

  it('Discard on the bar ignores a disabled request', () => {
    renderWithProviders(
      <Form formOptions={{ defaultValues: { name: 'x' } }}>
        <Input name="name" label="Name" />
        <ContextualSaveBar forceVisible discardDisabled />
      </Form>,
    );
    const discard = barButton('Discard');
    expect(discard.getAttribute('disabled')).toBeNull();
    expect(discard.getAttribute('aria-disabled')).toBeNull();
    expect(discard.getAttribute('data-mp-cancel-disabled-ignored')).toBe('true');
  });

  it('CONTAINER-CAP on the top pair only; bottom pair pinned 0 (bottom-docked sheet)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
        <Form formOptions={{ defaultValues: { name: 'x' } }}>
          <Input name="name" label="Name" />
          <ContextualSaveBar forceVisible />
        </Form>
      </Preset>,
    );
    const bar = savebar(result.container);
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute('data-mp-savebar-radius-class')).toBe('CONTAINER-CAP');
    expect(bar?.getAttribute('data-mp-savebar-dock')).toBe('bottom');
    expect(bar?.getAttribute('data-mp-savebar-top-radius')).toBe('18');
    expect(bar?.getAttribute('data-mp-savebar-bottom-radius')).toBe('0');
    const cls = String(bar?.className ?? '');
    expect(cls).not.toMatch(/t-radius-12/);
    const cs = bar ? getComputedStyle(bar) : null;
    expect(cs?.borderBottomLeftRadius === '0px' || cs?.borderBottomLeftRadius === '0').toBe(true);
    expect(cs?.borderBottomRightRadius === '0px' || cs?.borderBottomRightRadius === '0').toBe(true);
  });

  it('large under space=small caps the top pair at pad 13; bottoms stay 0', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'large', space: 'small' }}>
        <Form formOptions={{ defaultValues: { name: 'x' } }}>
          <Input name="name" label="Name" />
          <ContextualSaveBar forceVisible />
        </Form>
      </Preset>,
    );
    const bar = savebar(result.container);
    expect(bar?.getAttribute('data-mp-savebar-top-radius')).toBe('13');
    expect(bar?.getAttribute('data-mp-savebar-bottom-radius')).toBe('0');
  });

  it('none squares the top pair; bottoms stay 0', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Form formOptions={{ defaultValues: { name: 'x' } }}>
          <Input name="name" label="Name" />
          <ContextualSaveBar forceVisible />
        </Form>
      </Preset>,
    );
    const bar = savebar(result.container);
    expect(bar?.getAttribute('data-mp-savebar-top-radius')).toBe('$0');
    expect(bar?.getAttribute('data-mp-savebar-bottom-radius')).toBe('0');
  });
});

describe('clientKnownIdentity', () => {
  it('returns the client-owned identifier', () => {
    expect(clientKnownIdentity('svc-billing-api')).toBe('svc-billing-api');
  });

  it('refuses a missing or envelope-dropped identity', () => {
    expect(() => clientKnownIdentity(undefined)).toThrow(/client-known/i);
    expect(() => clientKnownIdentity('')).toThrow(/client-known/i);
    expect(() => clientKnownIdentity('undefined')).toThrow(/client-known/i);
  });
});
