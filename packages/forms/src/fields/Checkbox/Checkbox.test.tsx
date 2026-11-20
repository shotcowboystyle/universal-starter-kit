import { renderWithProviders } from '@repo/test-utils';
import {
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  Preset,
  wasKeyboardFocus,
} from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import type { CheckedState } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock(import('@repo/theme'), async (importOriginal) => ({
  ...(await importOriginal()),
  wasKeyboardFocus: vi.fn<() => boolean>(() => false),
}));

/** Computed px widths: '' or 'auto' read as 0, anything else keeps its numeric part. */
const pxOf = (value: string): number => {
  const parsed = Number(value.replace('px', ''));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isTransparent = (bg: string) => bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || bg === 'rgba(0,0,0,0)';

/** Presence + computed visibility of the indicator glyph, not just mount. */
const expectVisibleGlyph = (checkbox: Element) => {
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
};

const markedDescendants = (root: Element) =>
  [...root.querySelectorAll('*')].filter((el) => (el.getAttribute('class') ?? '').includes('_bg-accentBackg'));

describe(Checkbox, () => {
  afterEach(cleanup);

  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Accept terms"
          name="terms"
        />,
      );
      expect(result.findTextElement('Accept terms')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Required"
          name="req"
          required
        />,
      );
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Disabled"
          name="d"
          disabled
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-disabled')).toBe('true');
    });

    it('renders checked state', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Checked"
          name="c"
          checked
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Loading"
          name="l"
          skeleton
        />,
      );
      expect(result.container.querySelector("[role='checkbox']")).toBeNull();
    });

    it('calls onCheckedChange when clicked', () => {
      const onCheckedChange = vi.fn<(checked: CheckedState) => void>();
      const result = renderWithProviders(
        <Checkbox
          name="cb"
          defaultValue={false}
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onCheckedChange={onCheckedChange}
        />,
      );
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
      const onChange = vi.fn<(checked: CheckedState) => void>();
      const result = renderWithProviders(
        <Checkbox
          name="cb"
          label="Accept"
          defaultValue={false}
          onChange={onChange}
        />,
      );
      const box = result.container.querySelector<HTMLElement>('[data-checkbox-box="true"]');
      expect(box).toBeTruthy();
      fireEvent.click(box!);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('fires canonical onChange and the deprecated onCheckedChange alias once each', () => {
      const onChange = vi.fn<(checked: CheckedState) => void>();
      const onCheckedChange = vi.fn<(checked: CheckedState) => void>();
      const result = renderWithProviders(
        <Checkbox
          name="cb"
          defaultValue={false}
          onChange={onChange}
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onCheckedChange={onCheckedChange}
        />,
      );
      const checkbox = result.getCheckbox();
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
      expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
    });
  });

  // Regression: the check glyph must actually render (and be visible) when
  // checked — aria-checked alone is not enough. Guards against silent icon
  // regressions (renamed/missing icon import rendering null) and
  // stuck-hidden indicators.
  describe('check indicator glyph', () => {
    it('renders a visible check glyph when checked', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Checked"
          name="c"
          checked
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox).toBeTruthy();
      expectVisibleGlyph(checkbox!);
    });

    it('renders no glyph when unchecked', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Unchecked"
          name="u"
          checked={false}
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox?.querySelector('svg')).toBeNull();
    });

    it('glyph appears after toggling via click', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Toggle"
          name="t"
          defaultValue={false}
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox?.querySelector('svg')).toBeNull();
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expectVisibleGlyph(result.getCheckbox()!);
    });

    it('renders a visible glyph when indeterminate', () => {
      const result = renderWithProviders(
        <Checkbox
          label="Mixed"
          name="m"
          checked="indeterminate"
        />,
      );
      const checkbox = result.getCheckbox();
      expect(checkbox?.getAttribute('aria-checked')).toBe('mixed');
      expectVisibleGlyph(checkbox!);
    });
  });

  describe('ring anatomy', () => {
    it('idle box is empty (transparent fill); checked is fill, not a thicker border', () => {
      const { container } = render(
        <TamaguiProvider
          config={houseConfig}
          defaultTheme="light"
          disableInjectCSS>
          <Checkbox
            label="Checked"
            checked
          />
          <Checkbox
            label="Unchecked"
            checked={false}
          />
        </TamaguiProvider>,
      );
      const checkboxes = [...container.querySelectorAll('[role="checkbox"]')];
      const checkedRoot = checkboxes.find((b) => b.getAttribute('aria-checked') === 'true')!;
      const uncheckedRoot = checkboxes.find((b) => b.getAttribute('aria-checked') === 'false')!;
      const marked = checkedRoot.querySelector<HTMLElement>('[data-checkbox-box="true"]')!;
      const idle = uncheckedRoot.querySelector<HTMLElement>('[data-checkbox-box="true"]')!;
      expect(marked).toBeTruthy();
      expect(idle).toBeTruthy();
      expect(isTransparent(getComputedStyle(idle).backgroundColor)).toBe(true);
      const markedBw = pxOf(getComputedStyle(marked).borderTopWidth);
      const idleBw = pxOf(getComputedStyle(idle).borderTopWidth);
      expect(idleBw).toBeGreaterThanOrEqual(2);
      expect(markedBw).toBe(idleBw);
      expect(pxOf(getComputedStyle(marked).outlineWidth)).toBe(0);
    });

    it('keyboard focus rings the box, never the 44px target', async () => {
      vi.mocked(wasKeyboardFocus).mockReturnValue(true);
      try {
        const result = renderWithProviders(
          <Checkbox
            label="Focus me"
            name="f"
          />,
        );
        const checkbox = result.getCheckbox()!;
        await act(async () => {
          fireEvent.focusIn(checkbox);
        });
        const box = checkbox.querySelector<HTMLElement>('[data-checkbox-box="true"]');
        expect(box?.dataset.focusRing).toBe('true');
        expect(checkbox.matches('[data-focus-ring]')).toBe(false);
        expect(pxOf(getComputedStyle(checkbox).outlineWidth)).toBe(0);
      } finally {
        vi.mocked(wasKeyboardFocus).mockReturnValue(false);
      }
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form
          formOptions={{ defaultValues: { agree: false } }}
          submitText="Submit">
          <Checkbox
            name="agree"
            label="I agree"
          />
        </Form>,
      );
      expect(result.findTextElement('I agree')).toBeDefined();
    });
  });
});

describe(CheckboxGroup, () => {
  afterEach(cleanup);

  const options = [
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
    { label: 'Option C', value: 'c' },
  ];

  it('renders all options', () => {
    const result = renderWithProviders(
      <CheckboxGroup
        label="Pick options"
        name="opts"
        options={options}
      />,
    );
    expect(result.findTextElement('Option A')).toBeDefined();
    expect(result.findTextElement('Option B')).toBeDefined();
    expect(result.findTextElement('Option C')).toBeDefined();
  });

  it('fires canonical onChange and the deprecated onValueChange alias once each', () => {
    const onChange = vi.fn<(values: string[]) => void>();
    const onValueChange = vi.fn<(values: string[]) => void>();
    const result = renderWithProviders(
      <CheckboxGroup
        label="Pick options"
        name="opts"
        options={options}
        onChange={onChange}
        // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
        onValueChange={onValueChange}
      />,
    );
    const checkbox = result.container.querySelector<HTMLElement>("[role='checkbox']");
    expect(checkbox).toBeTruthy();
    if (checkbox) {
      fireEvent.click(checkbox);
    }
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['a']);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(['a']);
  });

  it('renders required label with asterisk', () => {
    const result = renderWithProviders(
      <CheckboxGroup
        label="Required"
        name="req"
        options={options}
        required
      />,
    );
    const label = result.container.querySelector('label');
    expect(label?.textContent).toContain('*');
  });

  it('renders skeleton placeholder', () => {
    const result = renderWithProviders(
      <CheckboxGroup
        label="Loading"
        name="l"
        options={options}
        skeleton
      />,
    );
    const checkboxes = result.container.querySelectorAll("[role='checkbox']");
    expect(checkboxes).toHaveLength(0);
  });

  it('renders with form context', () => {
    const result = renderWithProviders(
      <Form
        formOptions={{ defaultValues: { opts: [] } }}
        submitText="Submit">
        <CheckboxGroup
          name="opts"
          label="Options"
          options={options}
        />
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
      const result = renderWithProviders(
        <CheckboxGroup
          label="Pick"
          name="opts"
          card
          options={cardOptions}
        />,
      );
      expect(result.findTextElement('Card A')).toBeDefined();
      expect(result.findTextElement('Description for A')).toBeDefined();
    });

    it('does not render descriptions in plain mode', () => {
      const result = renderWithProviders(
        <CheckboxGroup
          label="Pick"
          name="opts"
          options={cardOptions}
        />,
      );
      expect(result.findTextElement('Card A')).toBeDefined();
      expect(result.findTextElement('Description for A')).toBeUndefined();
    });

    it('labels the checkbox via aria-labelledby and aria-describedby', () => {
      const result = renderWithProviders(
        <CheckboxGroup
          label="Pick"
          name="opts"
          card
          options={cardOptions}
        />,
      );
      const checkbox = result.container.querySelector<HTMLElement>("[role='checkbox']");
      const labelId = checkbox?.getAttribute('aria-labelledby');
      const descId = checkbox?.getAttribute('aria-describedby');
      expect(labelId).toBeTruthy();
      expect(document.querySelector(`[id="${labelId}"]`)?.textContent).toBe('Card A');
      expect(descId).toBeTruthy();
      expect(document.querySelector(`[id="${descId}"]`)?.textContent).toBe('Description for A');
    });

    it('checkbox click in card mode emits onChange exactly once', () => {
      const onChange = vi.fn<(values: string[]) => void>();
      const result = renderWithProviders(
        <CheckboxGroup
          label="Pick"
          name="opts"
          card
          options={cardOptions}
          onChange={onChange}
        />,
      );
      const checkbox = result.container.querySelector<HTMLElement>("[role='checkbox']");
      if (checkbox) {
        fireEvent.click(checkbox);
      }
      expect(onChange).toHaveBeenCalledWith(['a']);
      // last emit wins and must be the toggled-on state (no double-fire revert)
      expect(onChange.mock.lastCall?.[0]).toStrictEqual(['a']);
    });

    it('keeps index-based ids unique for duplicate option values', () => {
      const dupes = [
        { label: 'One', value: 'same', description: 'd1' },
        { label: 'Two', value: 'same', description: 'd2' },
      ];
      const result = renderWithProviders(
        <CheckboxGroup
          label="Pick"
          name="opts"
          card
          options={dupes}
        />,
      );
      const boxes = [...result.container.querySelectorAll("[role='checkbox']")];
      const ids = boxes.map((b) => b.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  it('E-FLAT: group glyphs stay unwrapped at elevation large; standalone Checkbox still wraps', () => {
    const result = renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <div data-testid="group">
          <CheckboxGroup
            label="Group"
            options={options}
            defaultValue={['a']}
          />
        </div>
        <div data-testid="solo">
          <Checkbox
            label="Solo"
            checked
          />
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
      vi.mocked(wasKeyboardFocus).mockReturnValue(true);
      try {
        const onValuesChange = vi.fn<(values: Record<string, boolean>) => void>();
        const result = renderWithProviders(
          <Checkboxes
            values={{ a: true }}
            onValuesChange={onValuesChange}>
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
        const item = result.container.querySelector<HTMLElement>('[data-checkbox-focus-item="true"]')!;
        expect(item).toBeTruthy();
        await act(async () => {
          fireEvent.focusIn(item);
        });
        expect(pxOf(getComputedStyle(item).outlineWidth)).toBe(0);
        const box = result.container.querySelector<HTMLElement>('[data-checkbox-box="true"]');
        expect(box?.dataset.focusRing).toBe('true');
      } finally {
        vi.mocked(wasKeyboardFocus).mockReturnValue(false);
      }
    });
  });

  describe('selected mark', () => {
    it('fills the checked box with the accent mark; the unchecked box stays neutral chrome', () => {
      const { container } = render(
        <TamaguiProvider
          config={houseConfig}
          defaultTheme="light"
          disableInjectCSS>
          <Checkbox
            label="Checked"
            checked
          />
          <Checkbox
            label="Unchecked"
            checked={false}
          />
        </TamaguiProvider>,
      );
      const boxes = [...container.querySelectorAll('[role="checkbox"]')];
      expect(boxes).toHaveLength(2);
      const checked = boxes.find((b) => b.getAttribute('aria-checked') === 'true');
      const unchecked = boxes.find((b) => b.getAttribute('aria-checked') === 'false');
      expect(checked).toBeTruthy();
      expect(unchecked).toBeTruthy();
      expect(markedDescendants(checked!).length).toBeGreaterThan(0);
      expect(markedDescendants(unchecked!)).toHaveLength(0);
    });
  });
});

const glyphRadiusClasses = (container: HTMLElement): string[] => {
  const box = container.querySelector<HTMLElement>('[data-checkbox-box="true"]');
  return (box?.getAttribute('class') ?? '').split(' ').filter((c) => c.startsWith('_btlr-'));
};

const RADIUS_STOPS = ['none', 'small', 'medium', 'large', 'full'] as const;

describe(clampCheckboxGlyphRadius, () => {
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
  afterEach(cleanup);

  it.each(RADIUS_STOPS)('glyph is square at none and capped at $2 through full — never a disc (%s)', (stop) => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: stop }}>
        <Checkbox
          label="Terms"
          name="t"
        />
      </Preset>,
    );
    const classes = glyphRadiusClasses(result.container);
    expect(
      classes.some((c) => c.includes('100000') || c.includes('radius-12')),
      `stop ${stop} must not paint a circle: ${classes.join(' ')}`,
    ).toBe(false);
    const matchesStop =
      stop === 'none'
        ? classes.some((c) => c.includes('radius-0') || c === '_btlr-0px')
        : classes.length === 1 && classes[0] === '_btlr-t-radius-2';
    expect(matchesStop, `stop ${stop} painted ${classes.join(' ')}`).toBe(true);
  });

  it('compound Checkboxes glyph stays capped at full', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Checkboxes
          values={{ a: true }}
          onValuesChange={() => {}}>
          <Checkboxes.Checkbox aria-label="A">
            <Checkboxes.Checkbox.Indicator />
          </Checkboxes.Checkbox>
        </Checkboxes>
      </Preset>,
    );
    const classes = glyphRadiusClasses(result.container);
    expect(classes.some((c) => c.includes('radius-12') || c.includes('100000'))).toBe(false);
    expect(classes).toStrictEqual(['_btlr-t-radius-2']);
  });

  it('role=checkbox hit target is not a disc (Tamagui size variant override)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Checkbox
          label="Terms"
          name="t"
        />
      </Preset>,
    );
    const root = result.getCheckbox();
    const classes = (root?.getAttribute('class') ?? '').split(' ').filter((c) => c.startsWith('_btlr-'));
    expect(classes.some((c) => c.includes('100000') || c.includes('radius-12'))).toBe(false);
  });
});
