import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  hexAlphaByte,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  isValidHex,
  normalizeHex,
  parseHex,
  rgbToHex,
  rgbToHsv,
} from './color';
import { AlphaStrip, HueStrip, SaturationPanel } from './parts';

vi.mock(import('@tamagui/lucide-icons-2'), () => ({
  Palette: () => null,
  X: () => null,
  Check: () => null,
  Pipette: () => null,
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the real LinearGradient is a class component; this probe is a function component, so a typed factory cannot be satisfied
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: {
    colors?: string[];
    locations?: number[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    style?: unknown;
    testID?: string;
  }) =>
    createElement('div', {
      'data-testid': props.testID ?? 'expo-linear-gradient',
      'data-colors': JSON.stringify(props.colors ?? []),
      'data-locations': JSON.stringify(props.locations ?? null),
      'data-start': JSON.stringify(props.start ?? null),
      'data-end': JSON.stringify(props.end ?? null),
    }),
}));

const loadColorPicker = async () => {
  const mod = await import('./index');
  return mod.ColorPicker;
};

describe('ColorPicker', () => {
  it('should handle disabled state', async () => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name="color"
        disabled
      />,
    );
    const input = result.container.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.getAttribute('aria-disabled')).toBe('true');

    const clickable = result.container.querySelector("input,button,[role='button']");
    if (clickable) {
      fireEvent.click(clickable);
    }
    expect(result.findTextElement('Opacity: 100%')).toBeUndefined();
    expect(document.body.querySelector('[aria-label="Hue"]')).toBeNull();
  });

  it('opens popover and updates value from hex input', async () => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name="color"
        placeholder="Pick a color"
        showAlpha
      />,
    );

    const triggerInput = result.container.querySelector('input');
    expect(triggerInput).toBeTruthy();

    await act(async () => {
      if (triggerInput) {
        fireEvent.click(triggerInput);
      }
    });

    await waitFor(() => {
      expect(document.body.querySelector('[aria-label="Hue"]')).toBeTruthy();
    });

    const hexInput = document.body.querySelector('input[placeholder="#000000"]');
    expect(hexInput).toBeTruthy();

    await act(async () => {
      if (hexInput) {
        fireEvent.change(hexInput, { target: { value: '00ff00' } });
      }
    });

    await waitFor(() => {
      const updated = result.container.querySelector('input');
      expect(updated?.value).toBe('#00FF00FF');
    });
  });

  it('clears selected value from trigger button', async () => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name="color"
        placeholder="Pick a color"
        defaultValue="#112233"
      />,
    );

    const input = result.container.querySelector('input');
    expect(input?.value).toBe('#112233');

    const triggerButton = result.container.querySelector('button');
    await act(async () => {
      if (triggerButton) {
        fireEvent.click(triggerButton);
      }
    });

    await waitFor(() => {
      const updated = result.container.querySelector('input');
      expect(updated?.value ?? '').toBe('');
    });
  });

  it('fires canonical onChange and the deprecated onValueChange alias once when cleared', async () => {
    const ColorPicker = await loadColorPicker();
    const onChange = vi.fn<(value: string) => void>();
    const onValueChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name="color"
        defaultValue="#112233"
        onChange={onChange}
        // oxlint-disable-next-line typescript/no-deprecated -- exercising the deprecated alias is the point of this test
        onValueChange={onValueChange}
      />,
    );

    const triggerButton = result.container.querySelector('button');
    expect(triggerButton).toBeTruthy();
    await act(async () => {
      if (triggerButton) {
        fireEvent.click(triggerButton);
      }
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('');
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('');
  });

  it('shows format validation error for unrecognized rgb value', async () => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name={undefined as never}
        format="rgb"
        defaultValue="not-rgb"
      />,
    );

    expect(result.findTextElement('Color must be a recognized RGB value')).toBeDefined();
  });

  it.each([
    ['rgb', 'rgb( 1 , 2 , 3 )', true],
    ['rgb', 'rgba(255, 0, 0, .5)', true],
    ['rgb', 'rgb(1, 2)', false],
    ['hsl', 'hsl(-120, 100%, 50%)', true],
    ['hsl', 'hsla(120, 50.5%, 50%, 0.25)', true],
    ['hsl', 'hsl(120, 50, 50%)', false],
  ] as const)('accepts %s value %s: %s', async (format, value, valid) => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name={undefined as never}
        format={format}
        defaultValue={value}
      />,
    );
    const message = `Color must be a recognized ${format.toUpperCase()} value`;
    expect(result.findTextElement(message) === undefined).toBe(valid);
  });

  describe('color utilities', () => {
    it('validates and normalizes hex values', () => {
      expect(isValidHex('#AABBCC')).toBe(true);
      expect(isValidHex('#abc')).toBe(true);
      expect(isValidHex('#11223344')).toBe(true);
      expect(isValidHex('123456')).toBe(false);
      expect(normalizeHex('#abc')).toBe('#AABBCC');
      expect(normalizeHex('aabbcc')).toBe('#AABBCC');
    });

    it('converts between RGB and HEX', () => {
      expect(rgbToHex(255, 0, 128)).toBe('#FF0080');
      expect(hexToRgb('#FF0080')).toStrictEqual({ r: 255, g: 0, b: 128 });
      expect(hexToRgb('invalid')).toBeNull();
    });

    it('converts between HSV and RGB/HEX', () => {
      expect(hsvToRgb(0, 100, 100)).toStrictEqual({ r: 255, g: 0, b: 0 });
      expect(hsvToHex(120, 100, 100)).toBe('#00FF00');

      const hsv = rgbToHsv(0, 0, 255);
      expect(hsv.h).toBe(240);
      expect(hsv.s).toBe(100);
      expect(hsv.v).toBe(100);

      const fromHex = hexToHsv('#0000FF');
      expect(fromHex.h).toBe(240);
      expect(fromHex.s).toBe(100);
      expect(fromHex.v).toBe(100);
    });

    it('parses 8-digit hex including alpha', () => {
      expect(parseHex('#11223344')).toStrictEqual({ r: 17, g: 34, b: 51, alpha: 27 });
      expect(hexAlphaByte(100)).toBe('FF');
      expect(hexAlphaByte(0)).toBe('00');
    });
  });

  it('commits 8-digit hex into color + alpha when showAlpha', async () => {
    const ColorPicker = await loadColorPicker();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name={undefined as never}
        showAlpha
        value="#FF0000"
        onChange={onChange}
      />,
    );
    const triggerInput = result.container.querySelector('input');
    await act(async () => {
      if (triggerInput) {
        fireEvent.click(triggerInput);
      }
    });
    await waitFor(() => {
      expect(document.body.querySelector('[aria-label="Opacity"]')).toBeTruthy();
    });
    const hexInput = document.body.querySelector('input[placeholder="#000000"]');
    await act(async () => {
      if (hexInput) {
        fireEvent.change(hexInput, { target: { value: '#11223344' } });
      }
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^#112233/iu));
    });
    const last = onChange.mock.calls.at(-1)?.[0] ?? '';
    expect(last.toUpperCase().startsWith('#112233')).toBe(true);
    expect(last).toHaveLength(9);
  });

  it('moves saturation with arrow keys', () => {
    const onChangeSV = vi.fn<(s: number, v: number) => void>();
    const result = renderWithProviders(
      <SaturationPanel
        hue={0}
        saturation={50}
        value={50}
        onChangeSV={onChangeSV}
        size={100}
      />,
    );
    const slider = result.container.querySelector('[role="slider"][aria-label="Saturation and brightness"]');
    expect(slider).toBeTruthy();
    fireEvent.keyDown(slider!, { key: 'ArrowRight' });
    expect(onChangeSV).toHaveBeenCalledWith(51, 50);
    fireEvent.keyDown(slider!, { key: 'ArrowUp' });
    expect(onChangeSV).toHaveBeenCalledWith(50, 51);
  });

  it('paints a vertical hue rail (Polaris)', () => {
    const result = renderWithProviders(
      <HueStrip
        hue={210}
        onChangeHue={() => {}}
        height={100}
        orientation="vertical"
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- reads (never writes) the rendered markup to assert the inline gradient CSS
    const html = result.container.innerHTML;
    expect(html).toContain('linear-gradient(to bottom, #f00');
    const rail = result.container.querySelector('[data-testid="color-picker-hue"]');
    expect(rail?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('does not open when disabled', async () => {
    const ColorPicker = await loadColorPicker();
    const result = renderWithProviders(
      <ColorPicker
        label="Color"
        name={undefined as never}
        disabled
        value="#112233"
      />,
    );
    const input = result.container.querySelector('input');
    await act(async () => {
      if (input) {
        fireEvent.click(input);
      }
    });
    expect(document.body.querySelector('[aria-label="Hue"]')).toBeNull();
  });

  describe('gradient backgrounds', () => {
    it('web path keeps CSS linear-gradient on saturation / hue / alpha', () => {
      const result = renderWithProviders(
        <>
          <SaturationPanel
            hue={210}
            saturation={80}
            value={60}
            onChangeSV={() => {}}
            size={100}
          />
          <HueStrip
            hue={210}
            onChangeHue={() => {}}
            width={100}
          />
          <AlphaStrip
            hue={210}
            saturation={80}
            value={60}
            alpha={50}
            onChangeAlpha={() => {}}
            width={100}
          />
        </>,
      );

      // oxlint-disable-next-line github/no-inner-html -- reads (never writes) the rendered markup to assert the inline gradient CSS
      const html = result.container.innerHTML;
      expect(html).toContain('linear-gradient(to right, #fff,');
      expect(html).toContain('linear-gradient(to top, #000, transparent)');
      expect(html).toContain(hsvToHex(210, 100, 100));
      expect(html).toMatch(/linear-gradient\(to right, #f00/u);
      expect(result.container.querySelectorAll('[data-testid="expo-linear-gradient"]')).toHaveLength(0);
    });

    it('native path stacks expo-linear-gradient for saturation, hue, and alpha', async () => {
      const { AlphaBackground, HueBackground, SaturationBackground } = await import('./gradients.native');

      const result = renderWithProviders(
        <>
          <SaturationBackground
            hueColor="#FF0000"
            width={100}
            height={100}
          />
          <HueBackground
            width={100}
            height={14}
          />
          <AlphaBackground
            hex="#00FF00"
            width={100}
            height={14}
          />
        </>,
      );

      const grads = result.container.querySelectorAll<HTMLElement>('[data-testid="expo-linear-gradient"]');
      // sat: 2 layers, hue: 1, alpha: 1
      expect(grads).toHaveLength(4);

      const colorLists = [...grads].map((el) => JSON.parse(el.dataset.colors ?? '[]'));
      expect(colorLists).toStrictEqual(
        expect.arrayContaining([
          ['#FFFFFF', '#FF0000'],
          ['rgba(0,0,0,0)', '#000000'],
          ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'],
          ['rgba(0,0,0,0)', '#00FF00'],
        ]),
      );
    });
  });

  describe('design-law 100%', () => {
    const here = import.meta.dirname;

    it('consumes FloatingPanel widthMode at-least-trigger (does not reimplement cover)', () => {
      const source = readFileSync(path.resolve(here, 'parts.tsx'), 'utf-8');
      expect(source).toContain('widthMode="at-least-trigger"');
      expect(source).not.toMatch(/^[ \t]*fitContent[ \t]*$/mu);
      expect(source).not.toContain('OVERLAY_ATTACH_GAP');
    });

    it('exports ColorPicker as a named export, not default', async () => {
      const mod = await import('./index');
      expect(mod.ColorPicker).toBeTypeOf('function');
      expect('default' in mod).toBe(false);
    });

    it('states format errors without banned copy words', async () => {
      const ColorPicker = await loadColorPicker();
      const result = renderWithProviders(
        <ColorPicker
          label="Color"
          name={undefined as never}
          format="rgb"
          defaultValue="not-rgb"
        />,
      );
      const text = result.container.textContent ?? '';
      const words = new Set(text.toLowerCase().split(/[^a-z]+/u));
      expect(['invalid', 'please', 'sorry', 'oops'].filter((word) => words.has(word))).toStrictEqual([]);
      expect(result.findTextElement('Color must be a recognized RGB value')).toBeDefined();
    });

    it('marks the editor host compose so a swatch pick does not dismiss', async () => {
      const ColorPicker = await loadColorPicker();
      const onChange = vi.fn<(value: string) => void>();
      const result = renderWithProviders(
        <ColorPicker
          label="Color"
          name={undefined as never}
          defaultValue="#FF0000"
          presetColors={['#00FF00', '#0000FF']}
          onChange={onChange}
        />,
      );
      const triggerInput = result.container.querySelector('input');
      await act(async () => {
        if (triggerInput) {
          fireEvent.click(triggerInput);
        }
      });
      await waitFor(() => {
        expect(document.body.querySelector('[aria-label="Hue"]')).toBeTruthy();
      });
      expect(document.body.querySelector('[data-dismiss-class="compose"]')).toBeTruthy();

      const radios = document.body.querySelectorAll('[role="radio"]');
      expect(radios.length).toBeGreaterThanOrEqual(2);
      await act(async () => {
        fireEvent.click(radios[0]);
      });
      expect(document.body.querySelector('[aria-label="Hue"]')).toBeTruthy();
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^#00FF00/iu));
      });
      const first = (onChange.mock.calls.at(-1)?.[0] ?? '').toUpperCase();
      expect(first.startsWith('#00FF00')).toBe(true);

      await act(async () => {
        fireEvent.click(radios[1]);
      });
      expect(document.body.querySelector('[aria-label="Hue"]')).toBeTruthy();
      await waitFor(() => {
        expect((onChange.mock.calls.at(-1)?.[0] ?? '').toUpperCase().startsWith('#0000FF')).toBe(true);
      });
    });

    it('swatches and cursors are square at radius none (R-BINARY)', () => {
      const none = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <HueStrip
            hue={0}
            onChangeHue={() => {}}
            height={100}
            orientation="vertical"
          />
        </Preset>,
      );
      const handle = none.container.querySelector('[data-testid="color-handle"]');
      expect(handle).toBeTruthy();
      const radius = getComputedStyle(handle!).borderRadius;
      expect(radius === '0px' || radius === '0').toBe(true);
    });
  });
});
