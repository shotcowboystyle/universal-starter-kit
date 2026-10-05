import { renderWithProviders } from '@repo/test-utils';
import { Preset, resolveRadiusClass, type BorderRadius } from '@repo/theme';
import * as Theme from '@repo/theme';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import {
  INSTANT_X_TRANSITION,
  JUMP_RELEASE_THRESHOLD_PX,
  NATIVE_JUMP_SETTLE_MS,
  getClosestThumbIndex,
  getJumpDelta,
  getJumpSettleMs,
  getNextSortedValues,
  getSliderThumbRenderSize,
  getSpringResidualPx,
  getThumbBaseX,
  hasMinStepsBetween,
  snapSliderValue,
  useSliderJumpMotion,
} from './jumpMotion';

import { Slider } from './index';

/** The repo's `quick` motion token physics (theme animationConfig). */
const QUICK_SPRING = { type: 'spring', damping: 20, mass: 1.2, stiffness: 250 } as const;

describe('Slider', () => {
  describe('basic rendering', () => {
    it('should render slider control', () => {
      const result = renderWithProviders(<Slider label="Basic Slider" name="basic" value={[50]} />);
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider).toBeDefined();
    });
  });

  describe('slider values and constraints', () => {
    it('should set min/max attributes', () => {
      const result = renderWithProviders(
        <Slider label="Constrained Slider" name="constrained" value={[20]} min={10} max={90} />,
      );
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider?.getAttribute('aria-valuemin')).toBe('10');
      expect(slider?.getAttribute('aria-valuemax')).toBe('90');
    });
  });

  describe('value changes', () => {
    it('should call onValueChange callback', async () => {
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <Slider label="Change Slider" name="change" value={[30]} onValueChange={onValueChange} />,
      );
      const slider = result.container.querySelector('[role="slider"]');
      if (slider) {
        await act(async () => {
          fireEvent.keyDown(slider, { key: 'ArrowRight' });
        });
      }
      expect(onValueChange).toHaveBeenCalled();
    });

    it('fires canonical onChange and the deprecated onValueChange alias with the same payload', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <Slider
          label="Canonical Slider"
          name="canonical"
          value={[30]}
          onChange={onChange}
          onValueChange={onValueChange}
        />,
      );
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider).toBeTruthy();
      if (slider) {
        await act(async () => {
          fireEvent.keyDown(slider, { key: 'ArrowRight' });
        });
      }
      expect(onChange).toHaveBeenCalled();
      expect(onValueChange).toHaveBeenCalled();
      expect(onChange.mock.calls.length).toBe(onValueChange.mock.calls.length);
      expect(onChange.mock.lastCall).toEqual(onValueChange.mock.lastCall);
    });
  });

  describe('styling and theming', () => {
    it('should render required label with asterisk', () => {
      const result = renderWithProviders(<Slider label="Required Slider" name="required" value={[50]} required />);

      const label = result.container.querySelector('label');
      expect(label).toBeDefined();
      expect(label?.textContent).toContain('Required Slider');
      expect(label?.textContent).toContain('*');
    });
  });

  describe('form integration', () => {
    describe('without form context', () => {
      it('should render helper text without form context', () => {
        const result = renderWithProviders(
          <Slider label="Standalone Slider" name="standalone" value={[40]} helperText="Move me" />,
        );
        expect(result.findTextElement('Move me')).toBeDefined();
      });
    });

    describe('with form context', () => {
      const FormExample = ({ defaultValue = [50], name = 'slider', onSubmit = async (_value: any) => {} }) => {
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
            <Slider label="Form Slider" name={name} />
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

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith({ slider: [50] });
        });
      });

      it('should handle form submission with changed slider value', async () => {
        const onSubmit = vi.fn();
        const result = renderWithProviders(
          <YStack>
            <FormExample defaultValue={[25]} onSubmit={onSubmit} />
          </YStack>,
        );

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith({ slider: [25] });
        });
      });
    });

    describe('with useForm hook directly', () => {
      it('should handle form submission with useForm', async () => {
        const onSubmitMock = vi.fn();
        const TestComponent = () => {
          const form = useForm({
            defaultValues: {
              volume: [80],
            },
            onSubmit: async ({ value }) => {
              onSubmitMock(value);
            },
          });

          return (
            <Form form={form}>
              <Slider label="Volume Control" name="volume" />
              <Button action="submit">Save</Button>
            </Form>
          );
        };

        const result = renderWithProviders(<TestComponent />);

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        await waitFor(() => {
          expect(onSubmitMock).toHaveBeenCalledWith({ volume: [80] });
        });
      });
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The upstream value was fed into tamagui as mount-only `defaultValue`,
    // so a value applied AFTER first paint (create-mode engine seeding,
    // form.setFieldValue, live server merge) never moved the thumb. The
    // slider must run controlled when an upstream value drives it — and
    // adopting a programmatic value must not emit onChange (a seeded
    // value is not a user edit).
    const getThumb = (container: ParentNode) => container.querySelector('[role="slider"]');

    it('standalone controlled: a value arriving after mount renders, without onChange', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <Slider label="Progress" value={[25]} onChange={onChange} onValueChange={onValueChange} />,
      );
      expect(getThumb(result.container)?.getAttribute('aria-valuenow')).toBe('25');

      // Late seed: the upstream doc value arrives after first paint.
      result.rerender(<Slider label="Progress" value={[75]} onChange={onChange} onValueChange={onValueChange} />);
      await waitFor(() => {
        expect(getThumb(result.container)?.getAttribute('aria-valuenow')).toBe('75');
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('form-integrated: a field value set after mount renders, without onChange', async () => {
      const onChange = vi.fn();
      let formApi: { setFieldValue: (name: 'volume', value: number[]) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { volume: [10] } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <Slider label="Volume" name="volume" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      expect(getThumb(result.container)?.getAttribute('aria-valuenow')).toBe('10');

      await act(async () => {
        formApi?.setFieldValue('volume', [60]);
      });
      await waitFor(() => {
        expect(getThumb(result.container)?.getAttribute('aria-valuenow')).toBe('60');
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('uncontrolled standalone (defaultValue only) still moves on keyboard input', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Slider label="Free" defaultValue={[40]} onChange={onChange} />);
      const thumb = getThumb(result.container);
      expect(thumb?.getAttribute('aria-valuenow')).toBe('40');
      await act(async () => {
        if (thumb) {
          fireEvent.keyDown(thumb, { key: 'ArrowRight' });
        }
      });
      await waitFor(() => {
        expect(getThumb(result.container)?.getAttribute('aria-valuenow')).toBe('41');
      });
      expect(onChange).toHaveBeenCalledWith([41]);
    });
  });

  describe('field integration', () => {
    it('should render error text when provided', () => {
      const result = renderWithProviders(
        <Slider label="Errored Slider" name="errored" value={[10]} error="Invalid value" />,
      );
      expect(result.container.textContent).toContain('Invalid value');
    });
  });

  describe('slider orientation', () => {
    it('should render horizontal slider by default', () => {
      const result = renderWithProviders(<Slider label="Orientation" name="orientation" value={[30]} />);
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider?.getAttribute('aria-orientation')).toBe('horizontal');
    });
  });

  describe('accessibility', () => {
    it('should expose slider role and value', () => {
      const result = renderWithProviders(<Slider label="A11y Slider" name="a11y" value={[65]} />);
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider).toBeDefined();
      expect(slider?.getAttribute('aria-valuenow')).toBeDefined();
    });
  });

  describe('value output', () => {
    it('renders the current value beside the track', () => {
      const result = renderWithProviders(<Slider label="Volume" value={[64]} />);
      expect(result.container.textContent).toContain('64');
    });

    it('renders a range as min–max', () => {
      const result = renderWithProviders(<Slider label="Price" value={[25, 75]} min={0} max={100} />);
      expect(result.container.textContent).toContain('25–75');
    });
  });

  describe('keyboard ring', () => {
    const getThumb = (container: ParentNode) => container.querySelector('[role="slider"]');

    it('paints the ring on keyboard focus and drops it on pointer-drag', async () => {
      const spy = vi.spyOn(Theme, 'wasKeyboardFocus').mockReturnValue(true);
      try {
        const result = renderWithProviders(<Slider label="Ring" defaultValue={[40]} />);
        const thumb = getThumb(result.container);
        expect(thumb).toBeTruthy();
        expect(thumb?.getAttribute('data-kb-focus')).toBeNull();

        await act(async () => {
          fireEvent.focus(thumb!);
        });
        expect(thumb?.getAttribute('data-kb-focus')).toBe('true');

        await act(async () => {
          fireEvent.pointerDown(thumb!);
        });
        expect(thumb?.getAttribute('data-kb-focus')).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });

    it('does not paint the ring on pointer-origin focus', async () => {
      const result = renderWithProviders(<Slider label="Click" defaultValue={[40]} />);
      const thumb = getThumb(result.container);
      expect(thumb).toBeTruthy();
      await act(async () => {
        fireEvent.pointerDown(document);
        fireEvent.pointerDown(thumb!);
        fireEvent.focus(thumb!);
      });
      expect(thumb?.getAttribute('data-kb-focus')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should render with boundary value', () => {
      const result = renderWithProviders(<Slider label="Boundary" name="boundary" value={[0]} />);
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider?.getAttribute('aria-valuenow')).toBe('0');
    });
  });

  describe('disabled state', () => {
    it('should render disabled slider', () => {
      const result = renderWithProviders(<Slider label="Disabled Slider" name="disabled" value={[30]} disabled />);
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider).toBeDefined();
      const disabledMarker =
        slider?.getAttribute('aria-disabled') === 'true' ||
        slider?.hasAttribute('data-disabled') ||
        Boolean(slider?.closest('[data-disabled]'));
      expect(disabledMarker).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('should handle validation errors', () => {
      const result = renderWithProviders(
        <Slider label="Required Slider" name="required" value={[0]} error="Slider value is required" />,
      );

      // Check for error text in the container
      const errorText = result.container.textContent;
      expect(errorText).toContain('Slider value is required');
    });
  });

  describe('performance', () => {
    it('should render multiple slider instances', () => {
      const result = renderWithProviders(
        <YStack>
          <Slider label="S1" name="s1" value={[10]} />
          <Slider label="S2" name="s2" value={[20]} />
          <Slider label="S3" name="s3" value={[30]} />
        </YStack>,
      );
      const sliders = result.container.querySelectorAll('[role="slider"]');
      expect(sliders.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('responsive behavior', () => {
    it('should render inside constrained width', () => {
      const result = renderWithProviders(
        <div style={{ width: 200 }}>
          <Slider label="Responsive Slider" name="responsive" value={[50]} />
        </div>,
      );
      const slider = result.container.querySelector('[role="slider"]');
      expect(slider).toBeDefined();
    });
  });

  describe('jump motion', () => {
    describe('jump math', () => {
      it('snaps raw pointer values to step and clamps to range', () => {
        expect(snapSliderValue(25.4, 0, 100, 1)).toBe(25);
        expect(snapSliderValue(25.6, 0, 100, 1)).toBe(26);
        expect(snapSliderValue(140, 0, 100, 1)).toBe(100);
        expect(snapSliderValue(-10, 0, 100, 1)).toBe(0);
        expect(snapSliderValue(0.34, 0, 1, 0.1)).toBe(0.3);
      });

      it('picks the closest thumb for a track press', () => {
        expect(getClosestThumbIndex([50], 10)).toBe(0);
        expect(getClosestThumbIndex([20, 80], 40)).toBe(0);
        expect(getClosestThumbIndex([20, 80], 70)).toBe(1);
      });

      it('measures the visual pixel distance between two values', () => {
        const context = { min: 0, max: 100, trackWidth: 400, thumbSize: 20 };
        // visualX(p) = trackW·p/100 + baseX(p) ⇒ Δ = Δp/100 · (trackW − S/2)
        expect(getJumpDelta(50, 25, context)).toBeCloseTo(97.5);
        expect(getJumpDelta(25, 50, context)).toBeCloseTo(-97.5);
        expect(getJumpDelta(50, 50, context)).toBe(0);
      });

      it("mirrors tamagui's quarter-width in-bounds thumb offset", () => {
        // baseX = quarter − (quarter/50)·percent − size/2 (LTR horizontal)
        expect(getThumbBaseX(0, 20)).toBe(-5);
        expect(getThumbBaseX(50, 20)).toBe(-10);
        expect(getThumbBaseX(100, 20)).toBe(-15);
      });

      it('resolves the RENDERED thumb size from the size recipe height', () => {
        // Thumb diameter is recipe.height ($1.5 → 24, $4 → 44 since
        // the recipe table was pinned to the Tamagui $size ramp), not
        // getSize(token, { shift: -1 }) and not the unshifted size ramp.
        // Circular vs square does not change diameter (radius is the knob).
        expect(getSliderThumbRenderSize('$1.5', true)).toBe(24);
        expect(getSliderThumbRenderSize('$1.5', false)).toBe(24);
        expect(getSliderThumbRenderSize('$4', true)).toBe(44);
        expect(getSliderThumbRenderSize('$true', false)).toBe(44);
      });

      it("adjusts values with tamagui's snap/sort/min-steps semantics (a11y actions)", () => {
        // increment/decrement step math used by onAccessibilityAction
        expect(getNextSortedValues([50], snapSliderValue(50 + 1, 0, 100, 1), 0)).toEqual([51]);
        expect(getNextSortedValues([100], snapSliderValue(100 + 1, 0, 100, 1), 0)).toEqual([100]);
        expect(getNextSortedValues([0], snapSliderValue(0 - 1, 0, 100, 1), 0)).toEqual([0]);
        // range: adjusting the min thumb past the max re-sorts (tamagui semantics)
        expect(getNextSortedValues([75, 75], snapSliderValue(76, 0, 100, 1), 0)).toEqual([75, 76]);
        // min-steps rejection mirrors tamagui updateValues
        expect(hasMinStepsBetween([70, 75], 10)).toBe(false);
        expect(hasMinStepsBetween([60, 75], 10)).toBe(true);
      });
    });

    describe('spring settle analytics', () => {
      it('computes a settle window from the spring physics that grows with jump size', () => {
        const short = getJumpSettleMs(QUICK_SPRING, 50);
        const long = getJumpSettleMs(QUICK_SPRING, 350);
        expect(long).toBeGreaterThan(short);
        expect(long).toBeLessThanOrEqual(2000);
        // the fixed 550ms window provably released long jumps early
        expect(long).toBeGreaterThan(NATIVE_JUMP_SETTLE_MS);
      });

      it('residual at the computed settle time is below the pop threshold', () => {
        for (const delta of [30, 130, 350]) {
          const settleMs = getJumpSettleMs(QUICK_SPRING, delta);
          expect(Math.abs(getSpringResidualPx(QUICK_SPRING, delta, settleMs))).toBeLessThan(
            JUMP_RELEASE_THRESHOLD_PX + 1e-6,
          );
        }
      });

      it("reproduces the sweep's pop: a ~127pt jump is still >1pt from base at 550ms", () => {
        expect(Math.abs(getSpringResidualPx(QUICK_SPRING, 127, NATIVE_JUMP_SETTLE_MS))).toBeGreaterThan(1);
      });

      it('starts at the full delta and decays toward zero', () => {
        expect(getSpringResidualPx(QUICK_SPRING, 100, 0)).toBe(100);
        expect(Math.abs(getSpringResidualPx(QUICK_SPRING, 100, 300))).toBeLessThan(10);
        expect(Math.abs(getSpringResidualPx(QUICK_SPRING, 100, 1500))).toBeLessThan(0.01);
      });

      it('covers timing configs, unknown tokens, and overdamped springs', () => {
        expect(getJumpSettleMs({ type: 'timing', duration: 300 }, 200)).toBe(350);
        expect(getJumpSettleMs(undefined, 200)).toBe(NATIVE_JUMP_SETTLE_MS);
        expect(getJumpSettleMs('ease-in 100ms', 200)).toBe(NATIVE_JUMP_SETTLE_MS);
        expect(getSpringResidualPx({ type: 'timing', duration: 100 }, 80, 50)).toBeCloseTo(40);
        expect(getSpringResidualPx({ type: 'timing', duration: 100 }, 80, 150)).toBe(0);
        // `lazy` (damping 18, stiffness 50, mass 1) is overdamped (ζ≈1.27):
        // monotone decay, settle below threshold at its own settle time
        const lazy = { type: 'spring', damping: 18, stiffness: 50 };
        const settleMs = getJumpSettleMs(lazy, 200);
        expect(Math.abs(getSpringResidualPx(lazy, 200, settleMs))).toBeLessThan(0.5);
      });
    });

    describe('native FLIP lifecycle (hook)', () => {
      const options = (overrides: Record<string, unknown> = {}) => ({
        enabled: true,
        min: 0,
        max: 100,
        step: 1,
        transitionToken: 'quick',
        initialValues: [50],
        getTrackWidth: () => 400,
        thumbSize: 20,
        ...overrides,
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('track press applies the FLIP delta instantly, glides next frame, then clears', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useSliderJumpMotion(options() as any));

        // mount: no transform residue, no armed token
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });

        act(() => {
          result.current.onTrackPress(25);
        });
        // phase "apply": layout snaps to 25, transform holds the old visual
        // position (base + delta) with an instant per-property transition
        const baseX = getThumbBaseX(25, 20); // -7.5
        const delta = getJumpDelta(50, 25, {
          min: 0,
          max: 100,
          trackWidth: 400,
          thumbSize: 20,
        }); // 97.5
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
          x: baseX + delta,
        });

        // next frame: phase "animate" — transform tweens back to base with the token
        act(() => {
          vi.advanceTimersByTime(16);
        });
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: { x: 'quick' },
          x: baseX,
        });

        // the trailing internal sync with the jump target keeps the session alive
        act(() => {
          result.current.onInternalValueChange([25]);
        });
        expect(result.current.getThumbMotionProps(0).x).toBe(baseX);

        // settle window elapses: override removed, back to instant transform
        act(() => {
          vi.advanceTimersByTime(NATIVE_JUMP_SETTLE_MS);
        });
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
      });

      it('drag sessions never arm the transform tween', () => {
        const { result } = renderHook(() => useSliderJumpMotion(options() as any));
        act(() => {
          result.current.onDragStart();
          result.current.onInternalValueChange([51]);
          result.current.onInternalValueChange([55]);
        });
        expect(result.current.flip).toBeNull();
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
      });

      it('demotes to a 1:1 drag when the pointer keeps moving after a track press', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useSliderJumpMotion(options() as any));
        act(() => {
          result.current.onTrackPress(25);
        });
        expect(result.current.flip).not.toBeNull();
        // trailing sync with the target keeps the session
        act(() => {
          result.current.onInternalValueChange([25]);
        });
        expect(result.current.flip).not.toBeNull();
        // a diverging value = drag-after-press → session dies, transform instant
        act(() => {
          result.current.onInternalValueChange([31]);
        });
        expect(result.current.flip).toBeNull();
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
      });

      it('grabbing the thumb mid-glide cancels the tween immediately', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useSliderJumpMotion(options() as any));
        act(() => {
          result.current.onTrackPress(25);
        });
        act(() => {
          vi.advanceTimersByTime(16); // phase "animate"
        });
        expect(result.current.getThumbMotionProps(0).transition).toEqual({ x: 'quick' });
        act(() => {
          result.current.onDragStart();
        });
        expect(result.current.flip).toBeNull();
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
      });

      it('skips no-op, unmeasured, disabled, and min-steps-rejected presses', () => {
        // same value → no visual distance → no session
        const { result: samePress } = renderHook(() => useSliderJumpMotion(options() as any));
        act(() => {
          samePress.current.onTrackPress(50);
        });
        expect(samePress.current.flip).toBeNull();

        // track not measured yet → no session
        const { result: unmeasured } = renderHook(() =>
          useSliderJumpMotion(options({ getTrackWidth: () => 0 }) as any),
        );
        act(() => {
          unmeasured.current.onTrackPress(25);
        });
        expect(unmeasured.current.flip).toBeNull();

        // disabled (web / vertical / rtl) → inert, component owns transitions
        const { result: disabled } = renderHook(() => useSliderJumpMotion(options({ enabled: false }) as any));
        act(() => {
          disabled.current.onTrackPress(25);
        });
        expect(disabled.current.flip).toBeNull();
        expect(disabled.current.getThumbMotionProps(0)).toEqual({});

        // tamagui rejects updates violating minStepsBetweenThumbs → no motion
        const { result: minSteps } = renderHook(() =>
          useSliderJumpMotion(options({ initialValues: [20, 30], minStepsBetweenThumbs: 15 }) as any),
        );
        act(() => {
          minSteps.current.onTrackPress(26);
        });
        expect(minSteps.current.flip).toBeNull();
      });

      it('scopes the session strictly to the thumb whose value jumped', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useSliderJumpMotion(options({ initialValues: [20, 80] }) as any));
        act(() => {
          result.current.onTrackPress(40);
        });
        const context = { min: 0, max: 100, trackWidth: 400, thumbSize: 20 };
        expect(result.current.flip?.movedIndex).toBe(0);
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
          x: getThumbBaseX(40, 20) + getJumpDelta(20, 40, context),
        });
        // Non-target thumb: NO override at all, in either phase — it can
        // neither shift when the session arms nor pop back at release (the
        // sweep measured a +2.5pt session shift from the old base-x pin).
        expect(result.current.getThumbMotionProps(1)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
        act(() => {
          vi.advanceTimersByTime(16); // phase "animate"
        });
        expect(result.current.getThumbMotionProps(1)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
        expect(result.current.getThumbMotionProps(1).x).toBeUndefined();
      });

      it('holds the override past the fixed window until the spring has settled', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
          useSliderJumpMotion(options({ resolveAnimationConfig: () => QUICK_SPRING }) as any),
        );
        act(() => {
          result.current.onTrackPress(90); // 50 → 90, |delta| = 156px
        });
        act(() => {
          vi.advanceTimersByTime(16); // promote to "animate" (spring starts)
        });
        const delta = getJumpDelta(50, 90, { min: 0, max: 100, trackWidth: 400, thumbSize: 20 });
        const settleMs = getJumpSettleMs(QUICK_SPRING, delta);
        expect(settleMs).toBeGreaterThan(NATIVE_JUMP_SETTLE_MS);
        // at the OLD fixed release point the spring is still >0.25pt out —
        // the override must still be armed (this was the visible pop)
        act(() => {
          vi.advanceTimersByTime(NATIVE_JUMP_SETTLE_MS);
        });
        expect(result.current.flip).not.toBeNull();
        // at the analytic settle time the residual is sub-threshold: release
        act(() => {
          vi.advanceTimersByTime(settleMs - NATIVE_JUMP_SETTLE_MS);
        });
        expect(result.current.flip).toBeNull();
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
        });
      });

      it('re-anchors a re-tap mid-glide to the in-flight position (no teleport)', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
          useSliderJumpMotion(options({ resolveAnimationConfig: () => QUICK_SPRING }) as any),
        );
        act(() => {
          result.current.onTrackPress(25); // 50 → 25
        });
        act(() => {
          vi.advanceTimersByTime(16); // spring starts
        });
        act(() => {
          result.current.onInternalValueChange([25]);
        });
        act(() => {
          vi.advanceTimersByTime(100); // mid-flight
        });
        act(() => {
          result.current.onTrackPress(75); // re-tap while still gliding
        });
        const context = { min: 0, max: 100, trackWidth: 400, thumbSize: 20 };
        const inFlightResidual = getSpringResidualPx(QUICK_SPRING, getJumpDelta(50, 25, context), 100);
        expect(Math.abs(inFlightResidual)).toBeGreaterThan(1); // genuinely mid-flight
        expect(result.current.flip?.phase).toBe('apply');
        // the new session pins the thumb where it visually IS (old-session
        // residual folded in), not where the old glide would have ended
        expect(result.current.getThumbMotionProps(0)).toEqual({
          transition: INSTANT_X_TRANSITION,
          x: getThumbBaseX(75, 20) + getJumpDelta(25, 75, context) + inFlightResidual,
        });
      });
    });

    describe('native a11y (web guard)', () => {
      it('web thumbs carry no native accessibility props and keep per-thumb aria labels', () => {
        const result = renderWithProviders(<Slider label="Guard" name="guard" value={[25, 75]} />);
        const thumbs = Array.from(result.container.querySelectorAll('[role="slider"]'));
        expect(thumbs.length).toBe(2);
        for (const thumb of thumbs) {
          // native-only props must never leak into the web DOM (byte-identical)
          expect(thumb.hasAttribute('accessibilitylabel')).toBe(false);
          expect(thumb.hasAttribute('accessibilityrole')).toBe(false);
          expect(thumb.hasAttribute('accessibilityactions')).toBe(false);
          expect(thumb.hasAttribute('accessibilityvalue')).toBe(false);
        }
        expect(thumbs[0].getAttribute('aria-label')).toContain('Minimum');
        expect(thumbs[1].getAttribute('aria-label')).toContain('Maximum');
      });
    });

    describe('BINARY radius', () => {
      const RADIUS_STOPS = ['none', 'small', 'medium', 'large', 'full'] as const satisfies readonly BorderRadius[];
      const RAIL_HEIGHT = 6;
      const THUMB_HEIGHT = getSliderThumbRenderSize('$1.5');

      function part(container: HTMLElement, name: 'rail' | 'fill' | 'thumb'): HTMLElement {
        const el = container.querySelector(`[data-slider-part="${name}"]`);
        expect(el, `missing data-slider-part=${name}`).toBeTruthy();
        return el as HTMLElement;
      }

      function paintedRadiusPx(el: Element): number {
        const inline = (el as HTMLElement).style.borderRadius;
        if (inline) {
          return Number.parseFloat(inline) || 0;
        }
        const computed = getComputedStyle(el).borderTopLeftRadius;
        if (computed && computed !== '') {
          const n = Number.parseFloat(computed);
          if (!Number.isNaN(n)) {
            return n;
          }
        }
        const atom = String((el as HTMLElement).className || '')
          .split(/\s+/)
          .find((c) => c.startsWith('_btlr-') || /^_br\d/.test(c));
        if (!atom) {
          return Number.NaN;
        }
        const px = atom.match(/(\d+(?:\.\d+)?)px$/);
        if (px) {
          return Number.parseFloat(px[1]);
        }
        if (atom.endsWith('-0') || atom === '_btlr-0') {
          return 0;
        }
        return Number.NaN;
      }

      it('rail, fill and thumb each measure 0 at none and height/2 at every other stop', () => {
        for (const stop of RADIUS_STOPS) {
          const result = renderWithProviders(
            <Preset overrides={{ borderRadius: stop }}>
              <Slider label="Radius Slider" value={[40]} />
            </Preset>,
          );
          const rail = part(result.container, 'rail');
          const fill = part(result.container, 'fill');
          const thumb = part(result.container, 'thumb');
          const railPx = resolveRadiusClass('BINARY', stop, { heightPx: RAIL_HEIGHT });
          const thumbPx = resolveRadiusClass('BINARY', stop, { heightPx: THUMB_HEIGHT });
          expect(railPx, stop).toBe(stop === 'none' ? 0 : RAIL_HEIGHT / 2);
          expect(thumbPx, stop).toBe(stop === 'none' ? 0 : THUMB_HEIGHT / 2);
          expect(paintedRadiusPx(rail), `rail @ ${stop}`).toBe(railPx);
          expect(paintedRadiusPx(fill), `fill @ ${stop}`).toBe(railPx);
          expect(paintedRadiusPx(thumb), `thumb @ ${stop}`).toBe(thumbPx);
        }
      });
    });

    describe('web session (dom)', () => {
      const getTrack = (container: HTMLElement, thumb: Element) =>
        Array.from(container.querySelectorAll('[data-orientation="horizontal"]')).find(
          (el) => el !== thumb && !el.contains(thumb),
        ) as HTMLElement;

      it('mounts without an armed transition or transform residue', () => {
        const result = renderWithProviders(<Slider label="Mount" name="mount" value={[50]} />);
        const thumb = result.container.querySelector('[role="slider"]') as HTMLElement;
        expect(thumb.style.transition).toBe('');
        expect(Array.from(thumb.classList)).toContain('_transition-none');
      });

      it('track click arms the left/transform tween then disarms after the jump window', async () => {
        // Controlled slider with the standard feedback loop (value + onChange
        // echoing back) — a bare static `value` is a frozen controlled input
        // now that the upstream value really drives tamagui.
        const JumpExample = () => {
          const [values, setValues] = useState([60]);
          return (
            // min > 0 so the degenerate unmeasured-layout pointer value stays truthy
            <Slider label="Jump" name="jump" value={values} onChange={setValues} min={10} max={110} />
          );
        };
        const result = renderWithProviders(<JumpExample />);
        const thumb = result.container.querySelector('[role="slider"]') as HTMLElement;
        const track = getTrack(result.container, thumb);
        expect(track).toBeDefined();

        await act(async () => {
          fireEvent.mouseDown(track);
        });
        // jump happened and the session armed a real transition covering left
        expect(thumb.getAttribute('aria-valuenow')).toBe('10');
        expect(thumb.style.transition).toContain('left');
        expect(thumb.style.transition).not.toContain('none');

        // session disarms after the jump window so later layout cannot re-tween
        await waitFor(
          () => {
            expect(thumb.style.transition).toBe('');
          },
          { timeout: 1500 },
        );
      });

      it('thumb drag start keeps the transition off', async () => {
        const result = renderWithProviders(<Slider label="Drag" name="drag" value={[40]} />);
        const thumb = result.container.querySelector('[role="slider"]') as HTMLElement;
        await act(async () => {
          fireEvent.mouseDown(thumb);
          fireEvent.mouseMove(thumb, { clientX: 50 });
        });
        expect(thumb.style.transition).not.toContain('left');
        await act(async () => {
          fireEvent.mouseUp(thumb);
        });
        expect(thumb.style.transition).not.toContain('left');
      });
    });
  });
});
