import { renderWithProviders } from '@repo/test-utils';
import { Theme } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { BarcodePreview, barcodePreviewSymbology } from './BarcodePreview';
import { countModules, encodeCode128B } from './code128';
import { QR_QUIET_ZONE_MODULES, encodeQr } from './qr';
import { resolveHtml5FormatIds, resolveNativeBarcodeTypes } from './scannerTypes';

/** Rebuild the module string ("1" = bar) from the encoder's runs. */
function toModuleString(value: string): string | null {
  const runs = encodeCode128B(value);
  if (!runs) {
    return null;
  }
  return runs.map((run) => (run.bar ? '1' : '0').repeat(run.modules)).join('');
}

describe('encodeCode128B', () => {
  it('encodes "A" as start B + data + checksum + stop (exact modules)', () => {
    // Sequence: START_B(104), "A"(33), check (104 + 33*1) % 103 = 34, STOP(106)
    expect(toModuleString('A')).toBe('11010010000' + '10100011000' + '10001011000' + '1100011101011');
  });

  it('computes the published check symbol 88 for "Wikipedia"', () => {
    const modules = toModuleString('Wikipedia');
    expect(modules).not.toBeNull();
    // 12 symbols: start + 9 data + check + stop → 11*11 + 13 modules
    expect(modules!.length).toBe(11 * 11 + 13);
    // Check symbol sits at index 10; BARS[88] = 11110010010
    expect(modules!.slice(110, 121)).toBe('11110010010');
  });

  it('always starts and ends with a bar and alternates runs', () => {
    const runs = encodeCode128B('SKU-001234')!;
    expect(runs[0].bar).toBe(true);
    expect(runs[runs.length - 1].bar).toBe(true);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].bar).toBe(!runs[i - 1].bar);
    }
    // (start + data + check) symbols × 11 modules + 13-module stop
    expect(countModules(runs)).toBe(('SKU-001234'.length + 2) * 11 + 13);
  });

  it('returns null for empty and non-ASCII values', () => {
    expect(encodeCode128B('')).toBeNull();
    expect(encodeCode128B('héllo')).toBeNull();
    expect(encodeCode128B('日本')).toBeNull();
  });
});

describe('BarcodePreview', () => {
  it('draws bars for an encodable value (labeled image, real content)', () => {
    const result = renderWithProviders(<BarcodePreview value="SKU-001234" />);
    const preview = result.container.querySelector('[data-testid="barcode-preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('aria-label')).toContain('SKU-001234');
    // Actual bar runs render — not an empty block
    expect(preview!.firstElementChild!.children.length).toBeGreaterThan(10);
  });

  it('renders nothing for an empty value (host owns the empty state)', () => {
    const result = renderWithProviders(<BarcodePreview value="" />);
    expect(result.container.querySelector('[data-testid="barcode-preview"]')).toBeNull();
  });

  it('falls back to honest text for values Code 128 B cannot encode', () => {
    const result = renderWithProviders(<BarcodePreview value="héllo" />);
    expect(result.container.querySelector('[data-testid="barcode-preview"]')).toBeNull();
    expect(result.container.textContent).toContain('héllo');
  });
});

/**
 * Round trip: the symbology the preview DRAWS for a format
 * token and the format id the scanner RESOLVES for the same token must always
 * agree — a field can never draw one symbology while scanning another.
 */
describe('barcodePreviewSymbology — scanner round trip', () => {
  const html5Enum = { QR_CODE: 0, CODE_128: 10 };

  it('draws QR for every alias the scanner resolves to qr', () => {
    for (const alias of ['qr', 'qrcode', 'qr_code', 'QR Code', 'QR-CODE']) {
      expect(barcodePreviewSymbology(alias)).toBe('qr');
      expect(resolveNativeBarcodeTypes([alias])).toEqual(['qr']);
      expect(resolveHtml5FormatIds([alias], html5Enum)).toEqual([html5Enum.QR_CODE]);
    }
  });

  it('draws the Code 128 strip for code128 aliases, resolved identically', () => {
    for (const alias of ['code128', 'code_128', 'Code 128']) {
      expect(barcodePreviewSymbology(alias)).toBe('code128');
      expect(resolveNativeBarcodeTypes([alias])).toEqual(['code128']);
      expect(resolveHtml5FormatIds([alias], html5Enum)).toEqual([html5Enum.CODE_128]);
    }
  });

  it('keeps the historical strip for absent or unknown tokens (never a false qr)', () => {
    expect(barcodePreviewSymbology(undefined)).toBe('code128');
    expect(barcodePreviewSymbology('')).toBe('code128');
    expect(barcodePreviewSymbology('not-a-format')).toBe('code128');
  });
});

describe('BarcodePreview — qr format', () => {
  /** The field's own default bound (Barcode/index.tsx): 36 comfortable, 24 compact. */
  const formHeight = 36;

  /** Nearest Tamagui theme scope above an element (`t_light` / `t_dark`). */
  function themeScope(el: Element | null): string | undefined {
    for (let node = el?.parentElement; node; node = node.parentElement) {
      const scope = String(node.className).match(/\bt_(light|dark)\b/);
      if (scope) {
        return scope[1];
      }
    }
    return undefined;
  }

  it('the QR face pins dark-on-light in both schemes; the Code 128 strip follows the scheme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const result = renderWithProviders(
        <Theme name={scheme}>
          <BarcodePreview value="SHC-42" format="qr" height={120} />
          <BarcodePreview value="SKU-001234" format="code128" height={36} />
        </Theme>,
      );
      const square = result.container.querySelector('[data-testid="barcode-preview-qr"]') as HTMLElement | null;
      expect(square).not.toBeNull();
      expect(themeScope(square), `${scheme}: QR face scope`).toBe('light');
      expect(square!.className).toContain('_bg-background');
      const darkModule = [...square!.querySelectorAll('*')].find((el) =>
        (el as HTMLElement).className?.toString().includes('_bg-color'),
      ) as HTMLElement | undefined;
      expect(darkModule).toBeTruthy();
      const strip = result.container.querySelectorAll('[data-testid="barcode-preview"]')[1];
      expect(themeScope(strip), `${scheme}: strip scope`).toBe(scheme);
      result.unmount();
    }
  });

  it('draws the QR matrix canvas-free (labeled image, real module rows)', () => {
    const result = renderWithProviders(<BarcodePreview value="SKU-001234" format="qr" height={formHeight} />);
    const preview = result.container.querySelector('[data-testid="barcode-preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('aria-label')).toContain('SKU-001234');
    expect(result.container.querySelector('canvas')).toBeNull();
    const qrMatrix = result.container.querySelector('[data-testid="barcode-preview-qr"]');
    expect(qrMatrix).not.toBeNull();
    // One row stack per module row of the real symbol.
    expect(qrMatrix!.children.length).toBe(encodeQr('SKU-001234')!.size);
  });

  it("draws QR for the Frappe fieldtype's qrcode token via the shared alias table", () => {
    const result = renderWithProviders(<BarcodePreview value="SKU-001234" format="qrcode" height={formHeight} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).not.toBeNull();
  });

  it('draws values the 1-D strip cannot encode (the closed asymmetry)', () => {
    const result = renderWithProviders(<BarcodePreview value="héllo" format="qr" height={formHeight} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).not.toBeNull();
  });

  it('renders nothing for an empty value (host owns the empty state)', () => {
    const result = renderWithProviders(<BarcodePreview value="" format="qr" />);
    expect(result.container.querySelector('[data-testid="barcode-preview"]')).toBeNull();
  });

  it('falls back to honest mono text past version 10 capacity', () => {
    const long = 'x'.repeat(214);
    const result = renderWithProviders(<BarcodePreview value={long} format="qr" height={formHeight} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.textContent).toContain(long);
  });

  it('keeps the strip for non-qr formats (unchanged behavior)', () => {
    const result = renderWithProviders(<BarcodePreview value="SKU-001234" format="code128" />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.querySelector('[data-testid="barcode-preview"]')).not.toBeNull();
  });
});

/**
 * Whole-pixel modules. Measured on the media-11 board at DPR 2 BEFORE this
 * rule existed: bounds 33, 72 and 96 decoded and bounds 18, 24, 44 and 56 did
 * not — not a size floor (33 read, 44 did not) but a resampling one. 33/33
 * modules is exactly 1.000 px per module; 44/33 is 1.333, and a fractional
 * module rounds to different widths across the grid. It reached the field's
 * own default path: at height 36 / moduleWidth 1 a payload over 26 bytes
 * clamps under one pixel per module and stops reading, which is precisely the
 * scan-to-draw round trip exists to close.
 */
describe('BarcodePreview — qr geometry is whole-pixel or nothing', () => {
  const qrSquare = (ui: React.ReactElement) =>
    renderWithProviders(ui).container.querySelector('[data-testid="barcode-preview-qr"]') as HTMLElement | null;

  /**
   * Tamagui compiles geometry to atomic classes (`_w-87px`, `_pt-12px`), not
   * inline style, so the measurement reads the class list. Same numbers, and
   * it is the class the browser actually applies.
   */
  const px = (el: HTMLElement, prefix: string) => {
    const hit = (el.getAttribute('class') ?? '').split(/\s+/).find((c) => c.startsWith(`_${prefix}-`));
    return hit ? Number.parseFloat(hit.slice(prefix.length + 2)) : Number.NaN;
  };
  const edgeOf = (el: HTMLElement) => px(el, 'w');
  const quietOf = (el: HTMLElement) => px(el, 'pt');

  /** Modules per side including the 4-module quiet zone on each side. */
  const totalModules = (value: string) => encodeQr(value)!.size + 2 * QR_QUIET_ZONE_MODULES;

  it('draws at the natural size when moduleWidth fits under the bound', () => {
    // 6 bytes → version 1 → 21 + 8 = 29 modules. moduleWidth 3 asks for 3px
    // modules and the 120px bound allows 4, so 3 wins: 29 × 3 = 87.
    const value = 'SHC-42';
    expect(totalModules(value)).toBe(29);
    const square = qrSquare(<BarcodePreview value={value} format="qr" height={120} moduleWidth={3} />);
    expect(square).not.toBeNull();
    expect(edgeOf(square!)).toBe(87);
    expect(px(square!, 'h')).toBe(87);
    expect(quietOf(square!)).toBe(12); // 4 modules × 3px
  });

  it('treats the height bound as a CEILING, never a target', () => {
    // 18 bytes → version 2 → 25 + 8 = 33 modules at moduleWidth 1 = 33px. A
    // 44px bound does not stretch it to 44 and a fractional 1.333px module.
    const value = 'SHC-COMPOSE01-0417';
    expect(totalModules(value)).toBe(33);
    for (const height of [36, 44, 56]) {
      const square = qrSquare(<BarcodePreview value={value} format="qr" height={height} />);
      expect(edgeOf(square!)).toBe(33);
      expect(quietOf(square!)).toBe(4);
    }
  });

  it('snaps the module DOWN to a whole pixel rather than draw a fractional one', () => {
    // 33 modules under a 96px bound would be 2.909px per module. Snap to 2.
    const square = qrSquare(<BarcodePreview value="SHC-COMPOSE01-0417" format="qr" height={96} moduleWidth={9} />);
    expect(edgeOf(square!)).toBe(66);
    expect(quietOf(square!)).toBe(8);
  });

  it('never draws a module narrower than one whole pixel — every bound, every payload', () => {
    for (const value of ['SHC-42', 'SHC-COMPOSE01-0417', 'SHC-COMPOSE01-BACKUP-2026-08-28']) {
      for (const height of [18, 24, 29, 33, 36, 37, 44, 66, 96, 120]) {
        for (const moduleWidth of [1, 2, 3]) {
          const square = qrSquare(
            <BarcodePreview value={value} format="qr" height={height} moduleWidth={moduleWidth} />,
          );
          if (!square) {
            continue;
          } // honest text fallback — asserted below
          const edge = edgeOf(square);
          const pad = quietOf(square);
          const cell = edge / totalModules(value);
          expect(Number.isInteger(cell)).toBe(true);
          expect(cell).toBeGreaterThanOrEqual(1);
          expect(cell).toBeLessThanOrEqual(moduleWidth);
          expect(edge).toBeLessThanOrEqual(height); // containment
          expect(pad).toBe(cell * QR_QUIET_ZONE_MODULES);
        }
      }
    }
  });

  it('falls back to honest text under one whole pixel per module', () => {
    // compact (24) cannot hold 33 modules at a whole pixel each.
    const value = 'SHC-COMPOSE01-0417';
    const result = renderWithProviders(<BarcodePreview value={value} format="qr" height={24} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.textContent).toContain(value);
  });

  it('falls back to honest text when the payload outgrows the form bound', () => {
    // 31 bytes → version 3 → 29 + 8 = 37 modules, which does not fit 36px at
    // one whole pixel each. This is the case that silently shipped unreadable.
    const value = 'SHC-COMPOSE01-BACKUP-2026-08-28';
    expect(totalModules(value)).toBe(37);
    const result = renderWithProviders(<BarcodePreview value={value} format="qr" height={36} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.textContent).toContain(value);
  });

  it('draws nothing at all when the host already shows the value (textFallback false)', () => {
    const value = 'SHC-COMPOSE01-0417';
    const result = renderWithProviders(<BarcodePreview value={value} format="qr" height={24} textFallback={false} />);
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.textContent).not.toContain(value);
  });

  it("leaves the 1-D strip's geometry untouched", () => {
    const result = renderWithProviders(<BarcodePreview value="SKU-001234" height={18} />);
    expect(result.container.querySelector('[data-testid="barcode-preview"]')).not.toBeNull();
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
  });
});
