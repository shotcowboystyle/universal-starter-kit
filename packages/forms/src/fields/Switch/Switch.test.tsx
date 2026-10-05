import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { TamaguiProvider, YStack, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Switch } from './index';

// House builder themes for the selected-mark assertion — created at MODULE
// scope: tamagui registers a config's theme variables globally at
// createTamagui time, and a config created after the first render (inside a
// test body) never resolves its tokens (Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

describe('Switch', () => {
  describe('without form context', () => {
    it('should render with label and helper text correctly', () => {
      const result = renderWithProviders(
        <Switch
          label="Enable notifications"
          helperText="Receive push notifications"
          name="notifications"
          defaultValue={false}
        />,
      );
      const switchElement = result.getSwitch();

      expect(switchElement?.getAttribute('aria-checked')).toBe('false');
      expect(switchElement?.hasAttribute('disabled')).toBeFalsy();
    });

    it('should render required label with asterisk', () => {
      const result = renderWithProviders(<Switch label="Required Switch" name="switch" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('Required Switch');
      expect(label?.textContent).toContain('*');
    });

    it('should handle custom id prop', () => {
      const customId = 'custom-switch-id';
      const result = renderWithProviders(<Switch id={customId} label="Test" defaultValue={false} />);
      const switchElement = result.getSwitch();
      expect(switchElement?.id).toBe(customId);
    });

    it('should handle state transitions', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={false} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      await act(async () => {
        if (switchElement) {
          fireEvent.click(switchElement);
        }
      });
      expect(onCheckedChange).toHaveBeenCalledWith(true);
      if (switchElement) {
        fireEvent.click(switchElement);
      }
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });

    it('fires canonical onChange and the deprecated onCheckedChange alias once each', async () => {
      const onChange = vi.fn();
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={false} onChange={onChange} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      await act(async () => {
        if (switchElement) {
          fireEvent.click(switchElement);
        }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('forwards top-level aria-label to the role=switch node', () => {
      const result = renderWithProviders(<Switch aria-label="Toggle availability" defaultValue={false} />);
      const switchElement = result.getSwitch();
      expect(switchElement?.getAttribute('aria-label')).toBe('Toggle availability');
    });

    it('forwards top-level aria-labelledby to the role=switch node', () => {
      const result = renderWithProviders(<Switch aria-labelledby="external-label-id" defaultValue={false} />);
      const switchElement = result.getSwitch();
      expect(switchElement?.getAttribute('aria-labelledby')).toBe('external-label-id');
    });

    it('top-level aria-label wins over the switchProps escape hatch', () => {
      const result = renderWithProviders(
        <Switch
          aria-label="Dedicated prop"
          switchProps={{ 'aria-label': 'Escape hatch' } as any}
          defaultValue={false}
        />,
      );
      const switchElement = result.getSwitch();
      expect(switchElement?.getAttribute('aria-label')).toBe('Dedicated prop');
    });

    it('should toggle on via press+drag across the track', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={false} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      if (!switchElement) {
        return;
      }

      await act(async () => {
        fireEvent.pointerDown(switchElement, { clientX: 0, pointerId: 1, button: 0 });
      });
      await act(async () => {
        fireEvent(document, new PointerEvent('pointermove', { clientX: 48, pointerId: 1, bubbles: true }));
      });
      await act(async () => {
        fireEvent(document, new PointerEvent('pointerup', { clientX: 48, pointerId: 1, bubbles: true }));
      });

      expect(onCheckedChange).toHaveBeenCalledWith(true);
      expect(switchElement.getAttribute('aria-checked')).toBe('true');
    });

    it('should toggle off via press+drag across the track', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={true} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      if (!switchElement) {
        return;
      }

      await act(async () => {
        fireEvent.pointerDown(switchElement, { clientX: 48, pointerId: 1, button: 0 });
      });
      await act(async () => {
        fireEvent(document, new PointerEvent('pointermove', { clientX: 0, pointerId: 1, bubbles: true }));
      });
      await act(async () => {
        fireEvent(document, new PointerEvent('pointerup', { clientX: 0, pointerId: 1, bubbles: true }));
      });

      expect(onCheckedChange).toHaveBeenCalledWith(false);
      expect(switchElement.getAttribute('aria-checked')).toBe('false');
    });

    it('does not enter drag mode below the drag-intent threshold (mid-flight retargets must not teleport)', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={false} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      if (!switchElement) {
        return;
      }
      const thumb = switchElement.querySelector('.is_SwitchThumb') as HTMLElement;
      expect(thumb).toBeTruthy();

      await act(async () => {
        fireEvent.pointerDown(switchElement, { clientX: 0, pointerId: 1, button: 0 });
      });
      await act(async () => {
        // 5px < SWITCH_DRAG_INTENT_PX (10): must NOT engage dragX — engaging
        // it snaps the thumb + disables its transition, teleporting any
        // in-flight toggle animation (interruptibility).
        fireEvent(document, new PointerEvent('pointermove', { clientX: 5, pointerId: 1, bubbles: true }));
      });
      // Thumb stays at its resting position — not tracking the sub-intent pointer.
      expect(thumb.style.transform || '').not.toContain('5px');

      await act(async () => {
        fireEvent(document, new PointerEvent('pointerup', { clientX: 5, pointerId: 1, bubbles: true }));
      });
      // Sub-intent gesture is a click: the follow-up click toggle still fires.
      await act(async () => {
        fireEvent.click(switchElement);
      });
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('should not toggle when a drag snaps back below the midpoint', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Switch name="switch" defaultValue={false} onCheckedChange={onCheckedChange} />,
      );
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      if (!switchElement) {
        return;
      }

      await act(async () => {
        fireEvent.pointerDown(switchElement, { clientX: 0, pointerId: 1, button: 0 });
      });
      await act(async () => {
        // Past drag-intent (10px) but still below the snap midpoint
        // (recipe $4 track ≈ 21px, midpoint ≈ 10.5).
        fireEvent(document, new PointerEvent('pointermove', { clientX: 10, pointerId: 1, bubbles: true }));
      });
      await act(async () => {
        fireEvent(document, new PointerEvent('pointerup', { clientX: 10, pointerId: 1, bubbles: true }));
      });
      // Same-gesture press that follows a drag must not flip the value.
      await act(async () => {
        fireEvent.click(switchElement);
      });

      expect(onCheckedChange).not.toHaveBeenCalled();
      expect(switchElement.getAttribute('aria-checked')).toBe('false');

      // A later click (new gesture) still toggles.
      await act(async () => {
        fireEvent.click(switchElement);
      });
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('with form context', () => {
    const FormExample = ({ defaultValue = false, name = 'switch', onSubmit = async (_value: any) => {} }) => {
      return (
        <Form
          formOptions={{
            defaultValues: {
              [name]: defaultValue,
            },
          }}
          onSubmit={async (value) => {
            await onSubmit(value);
          }}>
          <Switch label="Test Switch" name={name} />
          <Button action="submit">Submit</Button>
        </Form>
      );
    };

    it('should render with form context and handle form submission', async () => {
      const onSubmit = vi.fn();
      const result = renderWithProviders(
        <YStack>
          <FormExample onSubmit={onSubmit} />
        </YStack>,
      );
      const switchElement = result.getSwitch();
      const submitButton = result.getSubmitButton();
      expect(switchElement?.getAttribute('aria-checked')).toBe('false');
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ switch: false });
      });
      await act(async () => {
        if (switchElement) {
          fireEvent.click(switchElement);
        }
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ switch: true });
      });
    });

    it('should handle disabled state in form context', async () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { switch: false } }}>
          <Switch label="Test Switch" name="switch" disabled onCheckedChange={onCheckedChange} />
        </Form>,
      );
      const switchElement = result.getSwitch();
      await act(async () => {
        if (switchElement) {
          fireEvent.click(switchElement);
        }
      });
      expect(onCheckedChange).not.toHaveBeenCalled();
      expect(switchElement?.getAttribute('aria-checked')).toBe('false');
      expect(switchElement?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('with useForm hook directly', () => {
    it('should handle form submission with useForm', async () => {
      const onSubmitMock = vi.fn();
      const TestComponent = () => {
        const form = useForm({
          defaultValues: {
            notifications: false,
          },
          onSubmit: async ({ value }) => {
            onSubmitMock(value);
          },
        });
        return (
          <Form form={form}>
            <Switch label="Enable Notifications" name="notifications" />
            <Button action="submit">Submit</Button>
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const switchElement = result.getSwitch();
      const submitButton = result.getSubmitButton();
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmitMock).toHaveBeenCalledWith({ notifications: false });
      });
      await act(async () => {
        if (switchElement) {
          fireEvent.click(switchElement);
        }
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmitMock).toHaveBeenCalledWith({ notifications: true });
      });
    });
  });

  describe('checked track mark (one emphasis)', () => {
    // The checked Switch track IS a selection mark, so it resolves the shared
    // accent mark token; the unchecked track stays neutral chrome. Stock test
    // themes carry no $accentBackground, so mount the house builder themes
    // for real resolution.
    it('paints the checked track with the accent mark and the unchecked track neutral', () => {
      const { container } = render(
        <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
          <YStack>
            <Switch label="On" name="on" defaultValue={true} />
            <Switch label="Off" name="off" defaultValue={false} />
          </YStack>
        </TamaguiProvider>,
      );
      const switches = Array.from(container.querySelectorAll("[role='switch']"));
      expect(switches.length).toBe(2);
      const on = switches.find((s) => s.getAttribute('aria-checked') === 'true') as HTMLElement;
      const off = switches.find((s) => s.getAttribute('aria-checked') === 'false') as HTMLElement;
      expect(on).toBeTruthy();
      expect(off).toBeTruthy();
      expect(on.className).toContain('_bg-accentBackg');
      expect(off.className).not.toContain('_bg-accentBackg');
    });
  });

  describe('ring anatomy', () => {
    it('does not paint a keyboard ring until keyboard-origin focus', () => {
      const result = renderWithProviders(<Switch label="Focus" defaultValue={false} />);
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      expect(switchElement?.getAttribute('data-kb-focus')).toBeNull();
    });

    it('does not use outline as the on/selected channel', () => {
      const result = renderWithProviders(<Switch label="On" defaultValue={true} />);
      const switchElement = result.getSwitch();
      expect(switchElement).toBeTruthy();
      if (!switchElement) {
        return;
      }
      expect(switchElement.getAttribute('aria-checked')).toBe('true');
      expect(switchElement.getAttribute('data-kb-focus')).toBeNull();
      const outline = getComputedStyle(switchElement).outlineWidth;
      expect(outline === '0px' || outline === '').toBe(true);
    });
  });
});
