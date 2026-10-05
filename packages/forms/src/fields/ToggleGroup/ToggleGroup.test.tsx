import { renderWithProviders } from '@repo/test-utils';
import {
  MIN_PRESS_TARGET,
  Preset,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  sizeRecipeForToken,
} from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { __resetDevWarnSeen } from '../../shared/devWarn';

import { ToggleGroup } from './index';

// The stock test themes carry no accent ramp, so token resolution for the
// selected mark is invisible under renderWithProviders. Mount the house
// builder themes (the same ones apps run) to assert the real resolved fill —
// the pattern Progress.test.tsx established.
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

function renderWithHouseThemes(ui: ReactElement) {
  return render(
    <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
      {ui}
    </TamaguiProvider>,
  );
}

/**
 * First three numeric groups (h, s, l) of an hsla() string — the digit prefix
 * Tamagui embeds in the atomic class it generates for a concrete color value.
 */
function hslDigits(hsla: string): string {
  return (hsla.match(/\d+/g) ?? []).slice(0, 3).join('');
}

const options = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

describe('ToggleGroup', () => {
  describe('without form context', () => {
    it('renders all options', () => {
      const result = renderWithProviders(<ToggleGroup label="Alignment" name="align" options={options} />);
      expect(result.findTextElement('Left')).toBeDefined();
      expect(result.findTextElement('Center')).toBeDefined();
      expect(result.findTextElement('Right')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<ToggleGroup label="Required" name="req" options={options} required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(
        <ToggleGroup label="Align" name="a" options={options} helperText="Choose alignment" />,
      );
      expect(result.findTextElement('Choose alignment')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<ToggleGroup label="Loading" name="l" options={options} skeleton />);
      expect(result.findTextElement('Left')).toBeUndefined();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<ToggleGroup label="Disabled" name="d" options={options} disabled />);
      expect(result.findTextElement('Left')).toBeDefined();
    });

    it('fires canonical onChange and the deprecated onValueChange alias once each', () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <ToggleGroup
          label="Alignment"
          name="align"
          options={options}
          onChange={onChange}
          onValueChange={onValueChange}
        />,
      );
      const center = result.findTextElement('Center');
      expect(center).toBeDefined();
      if (center) {
        fireEvent.click(center);
      }
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('center');
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith('center');
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { align: 'left' } }} submitText="Submit">
          <ToggleGroup name="align" label="Alignment" options={options} />
        </Form>,
      );
      expect(result.findTextElement('Left')).toBeDefined();
    });
  });

  describe('disabledReason', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      __resetDevWarnSeen();
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      __resetDevWarnSeen();
    });

    it('group reason takes the helper slot and silences bare-disabled', () => {
      renderWithProviders(
        <ToggleGroup
          label="Alignment"
          options={options}
          disabled
          disabledReason="Locked while the report is generating"
        />,
      );
      expect(screen.getByText('Locked while the report is generating')).toBeInTheDocument();
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    });

    it('DEV-warns bare-disabled for a group disabled without a reason', () => {
      renderWithProviders(<ToggleGroup label="Alignment" options={options} disabled />);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    });

    it('explained disabled item renders its reason line, is described by it, and blocks change', () => {
      const onChange = vi.fn();
      renderWithProviders(
        <ToggleGroup
          label="Alignment"
          options={[
            { label: 'Left', value: 'left' },
            {
              label: 'Center',
              value: 'center',
              disabled: true,
              disabledReason: 'Center layout needs the pro plan',
            },
          ]}
          onChange={onChange}
        />,
      );
      const reason = screen.getByText('Center layout needs the pro plan');
      expect(reason).toBeInTheDocument();
      const reasonId = reason.getAttribute('id');
      expect(reasonId).toBeTruthy();
      const described = document.querySelector(`[aria-describedby="${reasonId}"]`);
      expect(described).toBeTruthy();
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));

      const center = screen.getByText('Center');
      fireEvent.click(center);
      expect(onChange).not.toHaveBeenCalled();

      const left = screen.getByText('Left');
      fireEvent.click(left);
      expect(onChange).toHaveBeenCalledWith('left');
    });

    it('DEV-warns bare-disabled for a disabled item without a reason', () => {
      renderWithProviders(
        <ToggleGroup
          label="Alignment"
          options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center', disabled: true },
          ]}
        />,
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    });
  });

  describe('selected mark (one emphasis)', () => {
    it('fills the selected segment with the accent-tinted surface, never the neutral tier', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      // Segmented-control selection strength is pinned at TINTED: the
      // accent ramp's surface tier in a light scheme
      // is its palest step (accent11) — the same channel ViewSwitcher takes.
      const tint = houseThemes.light.accent11;
      expect(tint).toBeTruthy();
      const selected = container.querySelector('[data-state="on"]') as HTMLElement;
      const idle = container.querySelector('[data-state="off"]') as HTMLElement;
      expect(selected).toBeTruthy();
      expect(idle).toBeTruthy();
      expect(selected.className).toContain(`_bg-hsla${hslDigits(tint)}`);
      expect(idle.className).not.toContain(`_bg-hsla${hslDigits(tint)}`);
      // Ink marks selection nowhere: the old neutral $color8 fill is gone.
      expect(selected.className).not.toContain('_bg-color8');
    });
  });

  describe('segmented anatomy', () => {
    it('does not paint a border on every segment — selected is fill, idle is chromeless', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(3);
      for (const segment of segments) {
        expect(segment.className).toMatch(/_bw-0\b|_borderw-0\b|bw-0/);
        expect(segment.className).not.toMatch(/_bw-1\b/);
      }
    });

    it('squares interior corners and rounds only the outer edges', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="center" />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(3);
      const [first, middle, last] = segments;
      // Tamagui emits per-corner radius classes from stackRadiusProps.
      expect(middle.className).toMatch(/bssr-0|bstr-0|borderStartStartRadius-0/i);
      expect(first.className).not.toEqual(middle.className);
      expect(last.className).not.toEqual(middle.className);
    });

    it('rings the focused segment, never the group frame', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      const group = container.querySelector('[role="group"]') as HTMLElement;
      expect(group).toBeTruthy();
      // Ring on the container is the known-bad segmented pattern: square
      // outline over a rounded frame, and it paints on mouse via :focus-within.
      expect(group.className).not.toMatch(/outlineWidth-2px|outlinew-2px|_ow-2px/);
    });

    it('paints segment height from the size recipe; press floor is hitSlop not minHeight', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments.length).toBeGreaterThan(0);
      const recipe = sizeRecipeForToken('$4');
      for (const segment of segments) {
        expect(segment.className).toContain(`_h-${recipe.height}px`);
        // The 44px floor is hitSlop, never a painted minHeight.
        expect(segment.className).not.toMatch(/_mih-44px|_minh-44px|minHeight-44px/);
        expect(MIN_PRESS_TARGET).toBe(44);
      }
    });

    it('applies the animation knob as transition on each segment (SB-M-221)', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments.length).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment.className).toMatch(/transition|tns-|trs-/i);
        expect(segment.style.transitionDuration).toMatch(/\d+ms/);
        expect(segment.style.transitionDuration).not.toMatch(/^0m?s$/);
      }
    });
  });

  describe('per-segment elevation wrapper', () => {
    function elevationWrapperFor(segment: HTMLElement): HTMLElement {
      const wrapper = segment.parentElement as HTMLElement;
      expect(wrapper?.getAttribute('style') ?? '').toMatch(/box-shadow/);
      return wrapper;
    }

    // The wrapper only exists to carry a shadow, and the default stop paints
    // none on a control, so these render at elevation medium.
    it("lays the wrapper out as a row so the segment's zero flex-basis sizes width, not height", () => {
      const { container } = renderWithHouseThemes(
        <Preset overrides={{ elevation: 'medium' }}>
          <ToggleGroup label="Alignment" options={options} defaultValue="left" />
        </Preset>,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(3);
      for (const segment of segments) {
        expect(segment.className).toContain('_fb-0px');
        const wrapper = elevationWrapperFor(segment);
        expect(wrapper.className).toContain('_fd-row');
        expect(wrapper.className).toContain('_fg-1');
      }
    });

    it('keeps the row wrapper in the vertical orientation', () => {
      const { container } = renderWithHouseThemes(
        <Preset overrides={{ elevation: 'medium' }}>
          <ToggleGroup label="Alignment" options={options} defaultValue="left" orientation="vertical" />
        </Preset>,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(3);
      for (const segment of segments) {
        expect(segment.className).toContain('_fb-0px');
        expect(elevationWrapperFor(segment).className).toContain('_fd-row');
      }
    });

    it('leaves the group frame flat while the segments carry the shadow (E-FLAT)', () => {
      const { container } = renderWithHouseThemes(
        <Preset overrides={{ elevation: 'medium' }}>
          <ToggleGroup label="Alignment" options={options} defaultValue="left" />
        </Preset>,
      );
      const group = container.querySelector('[role="group"]') as HTMLElement;
      expect(group).toBeTruthy();
      expect(group.className).not.toMatch(/_bxsh-/);
      expect(group.getAttribute('style') ?? '').not.toMatch(/box-shadow/);
    });
  });

  describe('one tab stop', () => {
    it('exposes exactly one tab stop among the segments', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="center" />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(3);
      expect(segments.map((el) => el.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    });
  });

  describe('edge cases', () => {
    it('keeps duplicate option values as distinct segments (SB-M-220)', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup
          label="Dup"
          options={[
            { label: 'One', value: 'same' },
            { label: 'Two', value: 'same' },
          ]}
        />,
      );
      const segments = [...container.querySelectorAll('[data-state]')] as HTMLElement[];
      expect(segments).toHaveLength(2);
      expect(segments.map((el) => el.id).filter(Boolean)).toHaveLength(2);
      expect(new Set(segments.map((el) => el.id)).size).toBe(2);
    });

    it('places interior seams on logical inline edges so RTL does not invert rounding', () => {
      const { container } = renderWithHouseThemes(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" />,
      );
      const seams = [...container.querySelectorAll('[data-mp-toggle-seam]')] as HTMLElement[];
      expect(seams.length).toBeGreaterThan(0);
      for (const seam of seams) {
        expect(seam.className + JSON.stringify(seam.style.cssText)).toMatch(/insetInlineEnd|inset-inline-end/i);
        expect(seam.getAttribute('style') ?? '').not.toMatch(/(?:^|;)\s*right\s*:/);
      }
    });

    it('blocks change when readOnly (SB-M-218)', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <ToggleGroup label="Alignment" options={options} defaultValue="left" readOnly onChange={onChange} />,
      );
      const center = result.findTextElement('Center');
      expect(center).toBeDefined();
      if (center) {
        fireEvent.click(center);
      }
      expect(onChange).not.toHaveBeenCalled();
    });

    it('sizes skeleton segments from the control recipe, never a 60px literal', () => {
      const recipe = sizeRecipeForToken('$4');
      const { container } = renderWithHouseThemes(<ToggleGroup label="Loading" options={options} skeleton />);
      const skels = [...container.querySelectorAll('[data-mp-toggle-skeleton]')] as HTMLElement[];
      expect(skels).toHaveLength(options.length);
      const expectedWidth = recipe.paddingHorizontal * 2 + 40;
      for (const skel of skels) {
        expect(skel.className).toContain(`_h-${recipe.height}px`);
        expect(skel.className).toContain(`_w-${expectedWidth}px`);
        expect(skel.className).not.toContain('_w-60px');
      }
    });
  });
});
