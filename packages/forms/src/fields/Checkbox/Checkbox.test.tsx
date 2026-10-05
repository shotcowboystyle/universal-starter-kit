import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions, Preset } from '@repo/theme';
import * as Theme from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { Checkbox } from './Checkbox';
import { CheckboxGroup } from './CheckboxGroup';

import { Checkboxes, clampCheckboxGlyphRadius, isCircularCheckboxRadius } from './index';

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

describe('Checkbox', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<Checkbox label="Accept terms" name="terms" />);
      expect(result.findTextElement('Accept terms')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Checkbox label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<Checkbox label="Disabled" name="d" disabled />);
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-disabled')).toBe('true');
    });

    it('renders checked state', () => {
      const result = renderWithProviders(<Checkbox label="Checked" name="c" checked />);
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Checkbox label="Loading" name="l" skeleton />);
      expect(result.container.querySelector("[role='checkbox']")).toBeNull();
    });

    it('calls onCheckedChange when clicked', () => {
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(<Checkbox name="cb" defaultValue={false} onCheckedChange={onCheckedChange} />);
      const checkbox = result.getCheckbox();
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('clicking the painted box still toggles', () => {
      // The painted square is pointerEvents=none so RN presses reach the
      // role=checkbox frame (inner View/SVG otherwise steal the responder).
      // jsdom still delivers the click on [data-checkbox-box] via bubbling.
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Checkbox name="cb" label="Accept" defaultValue={false} onChange={onChange} />,
      );
      const box = result.container.querySelector('[data-checkbox-box="true"]');
      expect(box).toBeTruthy();
      fireEvent.click(box!);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('fires canonical onChange and the deprecated onCheckedChange alias once each', () => {
      const onChange = vi.fn();
      const onCheckedChange = vi.fn();
      const result = renderWithProviders(
        <Checkbox name="cb" defaultValue={false} onChange={onChange} onCheckedChange={onCheckedChange} />,
      );
      const checkbox = result.getCheckbox();
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  // Regression: the check glyph must actually render (and be visible) when
  // checked — aria-checked alone is not enough. Guards against silent icon
  // regressions (renamed/missing icon import rendering null) and
  // stuck-hidden indicators.
  describe('check indicator glyph', () => {
    /** Presence + computed visibility of the indicator glyph, not just mount. */
    function expectVisibleGlyph(checkbox: Element) {
      const svg = checkbox.querySelector('svg');
      expect(svg, 'indicator svg must render inside role=checkbox').toBeTruthy();
      // phosphor icons draw with <path>; an empty svg means a broken icon import
      expect(svg!.querySelector('path'), 'indicator svg must have path content').toBeTruthy();
      let node: Element | null = svg;
      while (node && node !== checkbox.parentElement) {
        const style = getComputedStyle(node);
        expect(style.display, 'indicator ancestry must not be display:none').not.toBe('none');
        expect(style.visibility, 'indicator ancestry must not be hidden').not.toBe('hidden');
        if (style.opacity !== '') {
          expect(Number(style.opacity), 'indicator ancestry must not be transparent').toBeGreaterThan(0.05);
        }
        node = node.parentElement;
      }
    }

    it('renders a visible check glyph when checked', () => {
      const result = renderWithProviders(<Checkbox label="Checked" name="c" checked />);
      const checkbox = result.getCheckbox();
      expect(checkbox).toBeTruthy();
      expectVisibleGlyph(checkbox!);
    });

    it('renders no glyph when unchecked', () => {
      const result = renderWithProviders(<Checkbox label="Unchecked" name="u" checked={false} />);
      const checkbox = result.getCheckbox();
      expect(checkbox?.querySelector('svg')).toBeNull();
    });

    it('glyph appears after toggling via click', () => {
      const result = renderWithProviders(<Checkbox label="Toggle" name="t" defaultValue={false} />);
      const checkbox = result.getCheckbox();
      expect(checkbox?.querySelector('svg')).toBeNull();
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expectVisibleGlyph(result.getCheckbox()!);
    });

    it('renders a visible glyph when indeterminate', () => {
      const result = renderWithProviders(<Checkbox label="Mixed" name="m" checked="indeterminate" />);
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-checked')).toBe('mixed');
      expectVisibleGlyph(checkbox!);
    });
  });

  describe('ring anatomy', () => {
    function isTransparent(bg: string) {
      return bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || bg === 'rgba(0,0,0,0)';
    }

    it('idle box is empty (transparent fill); checked is fill, not a thicker border', () => {
      const { container } = render(
        <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
          <Checkbox label="Checked" checked />
          <Checkbox label="Unchecked" checked={false} />
        </TamaguiProvider>,
      );
      const checkboxes = Array.from(container.querySelectorAll('[role="checkbox"]'));
      const checkedRoot = checkboxes.find((b) => b.getAttribute('aria-checked') === 'true')!;
      const uncheckedRoot = checkboxes.find((b) => b.getAttribute('aria-checked') === 'false')!;
      const marked = checkedRoot.querySelector('[data-checkbox-box="true"]') as HTMLElement;
      const idle = uncheckedRoot.querySelector('[data-checkbox-box="true"]') as HTMLElement;
      expect(marked).toBeTruthy();
      expect(idle).toBeTruthy();
      expect(isTransparent(getComputedStyle(idle).backgroundColor)).toBe(true);
      const markedBw = parseFloat(getComputedStyle(marked).borderTopWidth) || 0;
      const idleBw = parseFloat(getComputedStyle(idle).borderTopWidth) || 0;
      expect(idleBw).toBeGreaterThanOrEqual(2);
      expect(markedBw).toBe(idleBw);
      expect(parseFloat(getComputedStyle(marked).outlineWidth) || 0).toBe(0);
    });

    it('keyboard focus rings the box, never the 44px target', async () => {
      const spy = vi.spyOn(Theme, 'wasKeyboardFocus').mockReturnValue(true);
      try {
        const result = renderWithProviders(<Checkbox label="Focus me" name="f" />);
        const checkbox = result.getCheckbox()!;
        await act(async () => {
          fireEvent.focusIn(checkbox);
        });
        const box = checkbox.querySelector('[data-checkbox-box="true"]');
        expect(box?.getAttribute('data-focus-ring')).toBe('true');
        expect(checkbox.getAttribute('data-focus-ring')).toBeNull();
        expect(parseFloat(getComputedStyle(checkbox).outlineWidth) || 0).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { agree: false } }} submitText="Submit">
          <Checkbox name="agree" label="I agree" />
        </Form>,
      );
      expect(result.findTextElement('I agree')).toBeDefined();
    });
  });
});

describe('CheckboxGroup', () => {
  const options = [
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
    { label: 'Option C', value: 'c' },
  ];

  it('renders all options', () => {
    const result = renderWithProviders(<CheckboxGroup label="Pick options" name="opts" options={options} />);
    expect(result.findTextElement('Option A')).toBeDefined();
    expect(result.findTextElement('Option B')).toBeDefined();
    expect(result.findTextElement('Option C')).toBeDefined();
  });

  it('fires canonical onChange and the deprecated onValueChange alias once each', () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const result = renderWithProviders(
      <CheckboxGroup
        label="Pick options"
        name="opts"
        options={options}
        onChange={onChange}
        onValueChange={onValueChange}
      />,
    );
    const checkbox = result.container.querySelector("[role='checkbox']");
    expect(checkbox).toBeTruthy();
    if (checkbox) {
      fireEvent.click(checkbox);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a']);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(['a']);
  });

  it('renders required label with asterisk', () => {
    const result = renderWithProviders(<CheckboxGroup label="Required" name="req" options={options} required />);
    const label = result.container.querySelector('label');
    expect(label?.textContent).toContain('*');
  });

  it('renders skeleton placeholder', () => {
    const result = renderWithProviders(<CheckboxGroup label="Loading" name="l" options={options} skeleton />);
    const checkboxes = result.container.querySelectorAll("[role='checkbox']");
    expect(checkboxes.length).toBe(0);
  });

  it('renders with form context', () => {
    const result = renderWithProviders(
      <Form formOptions={{ defaultValues: { opts: [] } }} submitText="Submit">
        <CheckboxGroup name="opts" label="Options" options={options} />
      </Form>,
    );
    expect(result.findTextElement('Option A')).toBeDefined();
  });

  describe('card mode', () => {
    const cardOptions = [
      { label: 'Card A', value: 'a', description: 'Description for A' },
      { label: 'Card B', value: 'b' },
    ];

    it('renders option descriptions in card mode', () => {
      const result = renderWithProviders(<CheckboxGroup label="Pick" name="opts" card options={cardOptions} />);
      expect(result.findTextElement('Card A')).toBeDefined();
      expect(result.findTextElement('Description for A')).toBeDefined();
    });

    it('does not render descriptions in plain mode', () => {
      const result = renderWithProviders(<CheckboxGroup label="Pick" name="opts" options={cardOptions} />);
      expect(result.findTextElement('Card A')).toBeDefined();
      expect(result.findTextElement('Description for A')).toBeUndefined();
    });

    it('labels the checkbox via aria-labelledby and aria-describedby', () => {
      const result = renderWithProviders(<CheckboxGroup label="Pick" name="opts" card options={cardOptions} />);
      const checkbox = result.container.querySelector("[role='checkbox']");
      const labelId = checkbox?.getAttribute('aria-labelledby');
      const descId = checkbox?.getAttribute('aria-describedby');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)?.textContent).toBe('Card A');
      expect(descId).toBeTruthy();
      expect(document.getElementById(descId!)?.textContent).toBe('Description for A');
    });

    it('checkbox click in card mode emits onChange exactly once', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <CheckboxGroup label="Pick" name="opts" card options={cardOptions} onChange={onChange} />,
      );
      const checkbox = result.container.querySelector("[role='checkbox']");
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expect(onChange).toHaveBeenCalledWith(['a']);
      // last emit wins and must be the toggled-on state (no double-fire revert)
      expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toEqual(['a']);
    });

    it('keeps index-based ids unique for duplicate option values', () => {
      const dupes = [
        { label: 'One', value: 'same', description: 'd1' },
        { label: 'Two', value: 'same', description: 'd2' },
      ];
      const result = renderWithProviders(<CheckboxGroup label="Pick" name="opts" card options={dupes} />);
      const boxes = [...result.container.querySelectorAll("[role='checkbox']")];
      const ids = boxes.map((b) => b.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  it('E-FLAT: group glyphs stay unwrapped at elevation large; standalone Checkbox still wraps', () => {
    const result = renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <div data-testid="group">
          <CheckboxGroup label="Group" options={options} defaultValue={['a']} />
        </div>
        <div data-testid="solo">
          <Checkbox label="Solo" checked />
        </div>
      </Preset>,
    );
    const groupBox = result.container
      .querySelector("[data-testid='group']")
      ?.querySelector("[data-checkbox-box='true']");
    expect(groupBox).toBeTruthy();
    expect(groupBox!.parentElement?.getAttribute('role')).toBe('checkbox');

    const soloBox = result.container.querySelector("[data-testid='solo']")?.querySelector("[data-checkbox-box='true']");
    expect(soloBox).toBeTruthy();
    expect(soloBox!.parentElement?.getAttribute('role')).not.toBe('checkbox');
  });

  describe('compound Checkboxes', () => {
    it('keyboard focus rings the box, never the focus-group item', async () => {
      const spy = vi.spyOn(Theme, 'wasKeyboardFocus').mockReturnValue(true);
      try {
        const onValuesChange = vi.fn();
        const result = renderWithProviders(
          <Checkboxes values={{ a: true }} onValuesChange={onValuesChange}>
            <Checkboxes.FocusGroup>
              <Checkboxes.Group>
                <Checkboxes.Group.Item>
                  <Checkboxes.FocusGroup.Item value="a">
                    <Checkboxes.Checkbox>
                      <Checkboxes.Checkbox.Indicator />
                    </Checkboxes.Checkbox>
                  </Checkboxes.FocusGroup.Item>
                </Checkboxes.Group.Item>
              </Checkboxes.Group>
            </Checkboxes.FocusGroup>
          </Checkboxes>,
        );
        const item = result.container.querySelector('[data-checkbox-focus-item="true"]') as HTMLElement;
        expect(item).toBeTruthy();
        await act(async () => {
          fireEvent.focusIn(item);
        });
        expect(parseFloat(getComputedStyle(item).outlineWidth) || 0).toBe(0);
        const box = result.container.querySelector('[data-checkbox-box="true"]');
        expect(box?.getAttribute('data-focus-ring')).toBe('true');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('selected mark', () => {
    it('fills the checked box with the accent mark; the unchecked box stays neutral chrome', () => {
      const { container } = render(
        <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
          <Checkbox label="Checked" checked />
          <Checkbox label="Unchecked" checked={false} />
        </TamaguiProvider>,
      );
      const boxes = Array.from(container.querySelectorAll('[role="checkbox"]'));
      expect(boxes.length).toBe(2);
      const checked = boxes.find((b) => b.getAttribute('aria-checked') === 'true');
      const unchecked = boxes.find((b) => b.getAttribute('aria-checked') === 'false');
      expect(checked).toBeTruthy();
      expect(unchecked).toBeTruthy();
      const marked = (root: Element) =>
        Array.from(root.querySelectorAll('*')).filter((el) =>
          (el as HTMLElement).className?.toString().includes('_bg-accentBackg'),
        );
      expect(marked(checked!).length).toBeGreaterThan(0);
      expect(marked(unchecked!).length).toBe(0);
    });
  });
});

function glyphRadiusClasses(container: HTMLElement): string[] {
  const box = container.querySelector('[data-checkbox-box="true"]');
  return String(box?.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

const RADIUS_STOPS = ['none', 'small', 'medium', 'large', 'full'] as const;

describe('clampCheckboxGlyphRadius', () => {
  it('squares when pointy, even if the token is full', () => {
    expect(clampCheckboxGlyphRadius('$12', { pointy: true })).toBe(0);
    expect(clampCheckboxGlyphRadius('$0')).toBe(0);
  });

  it('caps every stop at $2 — never $12, never h/2', () => {
    expect(clampCheckboxGlyphRadius('$2')).toBe('$2');
    expect(clampCheckboxGlyphRadius('$4')).toBe('$2');
    expect(clampCheckboxGlyphRadius('$6')).toBe('$2');
    expect(clampCheckboxGlyphRadius('$8')).toBe('$2');
    expect(clampCheckboxGlyphRadius('$12')).toBe('$2');
  });

  it('treats 5px on a 20px glyph as square and h/2 as circular', () => {
    expect(isCircularCheckboxRadius(5, 20)).toBe(false);
    expect(isCircularCheckboxRadius(10, 20)).toBe(true);
    expect(isCircularCheckboxRadius(50, 20)).toBe(true);
  });
});

describe('Checkbox never circular at any radius stop', () => {
  it('glyph is square at none and capped at $2 through full — never a disc', () => {
    for (const stop of RADIUS_STOPS) {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius: stop }}>
          <Checkbox label="Terms" name="t" />
        </Preset>,
      );
      const classes = glyphRadiusClasses(result.container);
      expect(
        classes.some((c) => c.includes('100000') || c.includes('radius-12')),
        `stop ${stop} must not paint a circle: ${classes.join(' ')}`,
      ).toBe(false);
      if (stop === 'none') {
        expect(
          classes.some((c) => c.includes('radius-0') || c === '_btlr-0px'),
          `none must be 0, got ${classes.join(' ')}`,
        ).toBe(true);
      } else {
        expect(classes, `stop ${stop}`).toEqual(['_btlr-t-radius-2']);
      }
      cleanup();
    }
  });

  it('compound Checkboxes glyph stays capped at full', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Checkboxes values={{ a: true }} onValuesChange={() => {}}>
          <Checkboxes.Checkbox aria-label="A">
            <Checkboxes.Checkbox.Indicator />
          </Checkboxes.Checkbox>
        </Checkboxes>
      </Preset>,
    );
    const classes = glyphRadiusClasses(result.container);
    expect(classes.some((c) => c.includes('radius-12') || c.includes('100000'))).toBe(false);
    expect(classes).toEqual(['_btlr-t-radius-2']);
  });

  it('role=checkbox hit target is not a disc (Tamagui size variant override)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Checkbox label="Terms" name="t" />
      </Preset>,
    );
    const root = result.getCheckbox();
    const classes = String(root?.className || '')
      .split(' ')
      .filter((c) => c.startsWith('_btlr-'));
    expect(classes.some((c) => c.includes('100000') || c.includes('radius-12'))).toBe(false);
  });
});
