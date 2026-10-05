import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { Signature, signatureValueToSvg } from './index';

const clearIcon = <span data-testid="clear-icon" />;

function encodeSignature(strokes: number[][][]): string {
  const json = JSON.stringify({ v: 2, s: strokes });
  return `data:application/json;base64,${btoa(json)}`;
}

const inkedValue = encodeSignature([
  [
    [0.1, 0.2, 0.5],
    [0.4, 0.3, 0.5],
    [0.7, 0.25, 0.5],
  ],
]);

function getPad(container: HTMLElement): HTMLElement {
  const label = container.querySelector('label[for]') as HTMLLabelElement | null;
  const id = label?.htmlFor;
  const pad = id ? (container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null) : null;
  if (!pad) {
    throw new Error('signature pad not found');
  }
  return pad;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  })) as any;
});

afterEach(cleanup);

describe('Signature', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<Signature label="Signature" name="sig" clearIcon={clearIcon} />);
      expect(result.findTextElement('Signature')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Signature label="Required" name="req" clearIcon={clearIcon} required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(
        <Signature label="Sign" name="s" clearIcon={clearIcon} helperText="Draw your signature" />,
      );
      expect(result.findTextElement('Draw your signature')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Signature label="Loading" name="l" clearIcon={clearIcon} skeleton />);
      expect(result.container.querySelector('svg')).toBeNull();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<Signature label="Disabled" name="d" clearIcon={clearIcon} disabled />);
      expect(result.findTextElement('Disabled')).toBeDefined();
      expect(getPad(result.container).getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { sig: '' } }} submitText="Submit">
          <Signature name="sig" label="Signature" clearIcon={clearIcon} />
        </Form>,
      );
      expect(result.findTextElement('Signature')).toBeDefined();
    });
  });

  describe('pad anatomy', () => {
    it('associates the label with the pad (htmlFor resolves)', () => {
      const result = renderWithProviders(<Signature label="Your Signature" name="sig" clearIcon={clearIcon} />);
      const pad = getPad(result.container);
      expect(pad.getAttribute('tabindex')).toBe('0');
      expect(result.container.textContent).toContain('X');
    });

    it('keeps an aria-label fallback when no label is given', () => {
      const result = renderWithProviders(<Signature name="sig" clearIcon={clearIcon} />);
      const pad = result.container.querySelector('[aria-label^="Signature"]') as HTMLElement | null;
      expect(pad).toBeTruthy();
      expect(pad?.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('ring anatomy', () => {
    it('is a keyboard tab stop whose pointer focus paints no ring', () => {
      const result = renderWithProviders(<Signature label="Signature" name="sig" clearIcon={clearIcon} />);
      const pad = getPad(result.container);
      expect(pad.getAttribute('tabindex')).toBe('0');

      fireEvent.pointerDown(document);
      fireEvent.focus(pad);
      expect(pad.getAttribute('data-keyboard-ring')).toBeNull();

      const svg = result.container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.style.outline).toContain('none');
    });
  });

  describe('clear', () => {
    it('clears from the pad via Delete when keyboard-focused', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Signature label="Signature" name="sig" value={inkedValue} onChange={onChange} clearIcon={clearIcon} />,
      );
      const pad = getPad(result.container);
      expect(pad.getAttribute('data-signed')).toBe('true');

      fireEvent.keyDown(document, { key: 'Tab' });
      fireEvent.focus(pad);
      fireEvent.keyDown(pad, { key: 'Delete' });
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('does not recommit an in-progress stroke after Clear (SB-M-808)', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Signature label="Signature" name="sig" value={inkedValue} onChange={onChange} clearIcon={clearIcon} />,
      );
      const svg = result.container.querySelector('svg');
      expect(svg).toBeTruthy();
      const clear = result.findTextElement('Clear');
      expect(clear).toBeDefined();

      fireEvent.pointerDown(svg!, { pointerId: 1, clientX: 20, clientY: 20, isPrimary: true });
      fireEvent.pointerMove(svg!, { pointerId: 1, clientX: 40, clientY: 30, isPrimary: true });
      fireEvent.click(clear as Element);
      fireEvent.pointerUp(svg!, { pointerId: 1, clientX: 40, clientY: 30, isPrimary: true });
      fireEvent.lostPointerCapture(svg!, { pointerId: 1 });

      expect(onChange).toHaveBeenCalledWith('');
      expect(onChange.mock.calls.at(-1)?.[0]).toBe('');
    });
  });
});

describe('design-law', () => {
  it('does not default export ink to raw black (scheme-aware token / currentColor)', () => {
    const svg = signatureValueToSvg(inkedValue, 200, 80);
    expect(svg.toLowerCase()).not.toContain('fill="#000000"');
    expect(svg.toLowerCase()).not.toContain('fill="#000"');
    expect(svg.toLowerCase()).not.toContain('fill="black"');
  });

  it('paints the pad from the input surface token, not raw white', () => {
    const result = renderWithProviders(<Signature label="Signature" name="sig" clearIcon={clearIcon} />);
    const pad = getPad(result.container);
    const bg = getComputedStyle(pad).backgroundColor;
    expect(bg).not.toBe('white');
    expect(bg.replace(/\s/g, '')).not.toMatch(/^rgb\(255,255,255\)$/);
    expect(bg.replace(/\s/g, '')).not.toMatch(/^#fff(fff)?$/i);
  });

  it('elevation knob reaches the pad frame (large-canvas honour, FileUpload sibling)', () => {
    const none = renderWithProviders(
      <Preset overrides={{ elevation: 'none' }}>
        <Signature label="Signature" name="sig" clearIcon={clearIcon} />
      </Preset>,
    );
    expect(getPad(none.container).className).not.toMatch(/_bxsh-/);
    cleanup();

    const large = renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <Signature label="Signature" name="sig" clearIcon={clearIcon} />
      </Preset>,
    );
    expect(getPad(large.container).className).toMatch(/_bxsh-/);
  });

  it('derives pad minHeight from the size token, not a 200px canvas', () => {
    const small = renderWithProviders(<Signature label="Small" name="s" size="$2" clearIcon={clearIcon} />);
    const large = renderWithProviders(<Signature label="Large" name="l" size="$4" clearIcon={clearIcon} />);
    const smallH = Number(getPad(small.container).getAttribute('data-min-height'));
    const largeH = Number(getPad(large.container).getAttribute('data-min-height'));
    expect(smallH).toBeGreaterThan(0);
    expect(largeH).toBeGreaterThan(smallH);
    expect(smallH).not.toBe(200);
    expect(largeH).not.toBe(200);
  });

  it('applies the body recipe to the legal-pad mark (no hardcoded 700/18)', () => {
    const result = renderWithProviders(<Signature label="Signature" name="sig" clearIcon={clearIcon} />);
    const mark = result.findTextElement('X') as HTMLElement | undefined;
    expect(mark).toBeDefined();
    const weight = getComputedStyle(mark!).fontWeight;
    expect(weight === '700' || weight === 'bold').toBe(false);
    expect(getComputedStyle(mark!).fontSize).not.toBe('18px');
  });

  it('supplies a default clear affordance when clearIcon is omitted', () => {
    const result = renderWithProviders(<Signature label="Signature" name="sig" value={inkedValue} />);
    expect(result.findTextElement('Clear')).toBeDefined();
    // Pad SVG plus the package-default eraser (house Button is role=button, not <button>).
    expect(result.container.querySelectorAll('svg').length).toBeGreaterThan(1);
  });

  it('does not record ink while readOnly (SB-M-810)', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <Signature label="Signature" name="sig" readOnly onChange={onChange} clearIcon={clearIcon} />,
    );
    const svg = result.container.querySelector('svg');
    expect(svg).toBeTruthy();
    fireEvent.pointerDown(svg!, { pointerId: 1, clientX: 20, clientY: 20, isPrimary: true });
    fireEvent.pointerMove(svg!, { pointerId: 1, clientX: 80, clientY: 40, isPrimary: true });
    fireEvent.pointerUp(svg!, { pointerId: 1, clientX: 80, clientY: 40, isPrimary: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(getPad(result.container).getAttribute('aria-readonly')).toBe('true');
  });
});

describe('signatureValueToSvg', () => {
  it('returns empty for an empty value', () => {
    expect(signatureValueToSvg('')).toBe('');
  });

  it('emits filled paths for v2 strokes', () => {
    const svg = signatureValueToSvg(inkedValue, 200, 80, '#111');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#111"');
  });
});
