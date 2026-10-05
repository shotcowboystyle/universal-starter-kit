import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload } from './index';

// The stock @tamagui/config themes used by renderWithProviders carry a
// different ramp than the house builder. The bento-derived dropzone asserts
// TOKEN-level treatment ($color9 dash, $color3/$color6 disabled wash, $color12
// remove disc), so mount the house builder's generated themes — the same
// ones the app config uses — and read the per-scheme values off the theme
// table itself (the Progress intent-spec precedent).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

function renderWithHouseThemes(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  return render(
    <TamaguiProvider config={houseConfig} defaultTheme={scheme} disableInjectCSS>
      {ui}
    </TamaguiProvider>,
  );
}

function getZone(container: Element): HTMLElement {
  const zone = container.querySelector('[data-file-upload="dropzone"]') as HTMLElement | null;
  expect(zone).toBeTruthy();
  return zone as HTMLElement;
}

function borderWidthAtomPx(el: HTMLElement, prefix: string): number {
  const atom = el.className.split(/\s+/).find((cls) => cls.startsWith(prefix));
  // No atom means the side declares no width and falls through to the UA
  // initial, which is exactly the defect — report it as such, not as 0.
  if (!atom) {
    return Number.NaN;
  }
  return Number.parseFloat(atom.slice(prefix.length));
}

async function pickFile(container: Element, file: File) {
  const input = container.querySelector("input[type='file']") as HTMLInputElement | null;
  expect(input).toBeTruthy();
  await act(async () => {
    if (input) {
      fireEvent.change(input, { target: { files: [file] } });
    }
  });
}

describe('FileUpload', () => {
  it('should render placeholder and upload button text', () => {
    const result = renderWithProviders(
      <FileUpload label="Attachment" placeholder="Upload your file" buttonText="Pick file" name="attachment" />,
    );

    expect(result.findTextElement('Attachment')).toBeDefined();
    expect(result.findTextElement('Upload your file')).toBeDefined();
    expect(result.findTextElement('Pick file')).toBeDefined();
  });

  it('fires canonical onChange and the deprecated onValueChange alias once when a file is chosen', async () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload label="Attachment" name="attachment" onChange={onChange} onValueChange={onValueChange} />,
    );

    const input = result.container.querySelector("input[type='file']") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await act(async () => {
      if (input) {
        fireEvent.change(input, { target: { files: [file] } });
      }
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(file);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(file);
  });

  it('associates the label with the dropzone (htmlFor resolves, aria-labelledby names it)', () => {
    const result = renderWithProviders(<FileUpload label="Attachment" name="attachment" />);

    const label = result.container.querySelector('label[for]') as HTMLLabelElement | null;
    expect(label?.textContent).toContain('Attachment');
    const forId = label?.getAttribute('for') as string;
    const dropzone = result.container.querySelector(`[id="${forId}"]`) as HTMLElement | null;
    expect(dropzone).toBeTruthy();
    expect(dropzone?.getAttribute('role')).toBe('button');
    const labelledBy = dropzone?.getAttribute('aria-labelledby');
    expect(labelledBy).toBe(`${forId}-label`);
    expect(document.getElementById(labelledBy as string)?.textContent).toContain('Attachment');
  });

  it('keeps an aria-label fallback on the dropzone when no label is given', () => {
    const result = renderWithProviders(<FileUpload name="attachment" />);
    const dropzone = result.container.querySelector('[data-file-upload="dropzone"]') as HTMLElement | null;
    expect(dropzone?.getAttribute('aria-label')).toBeTruthy();
    expect(dropzone?.getAttribute('aria-labelledby')).toBeNull();
  });

  it('paints the house ring on keyboard focus and suppresses the UA outline on pointer focus', () => {
    const result = renderWithProviders(<FileUpload label="Attachment" name="attachment" />);
    const dropzone = result.container.querySelector('[data-file-upload="dropzone"]') as HTMLElement | null;
    expect(dropzone).toBeTruthy();

    fireEvent.pointerDown(document.body);
    fireEvent.focus(dropzone as HTMLElement);
    expect(dropzone?.getAttribute('data-kb-ring')).toBeNull();

    fireEvent.blur(dropzone as HTMLElement);
    fireEvent.keyDown(document.body, { key: 'Tab', code: 'Tab' });
    fireEvent.focus(dropzone as HTMLElement);
    expect(dropzone?.getAttribute('data-kb-ring')).toBe('true');
  });

  // Regression: `data-kb-ring="true"` proved the STATE, never the paint.
  // The frame's ring kill is a `:focus-visible` rule; a keyboard-origin focus
  // matches `:focus-visible` too, so the base-state ring atom lost on
  // specificity and the browser computed outline-width 0px while every
  // assertion passed. Measured on the Storybook harness, not read off source.
  // The ring must therefore also win INSIDE the focus-visible layer.
  it('beats its own focus-visible kill — the ring wins in the layer that suppresses it', () => {
    const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />);
    const zone = getZone(container);
    fireEvent.keyDown(document.body, { key: 'Tab', code: 'Tab' });
    fireEvent.focus(zone);
    expect(zone.getAttribute('data-kb-ring')).toBe('true');

    // Base-state ring (2px solid $outlineColor at offset 0).
    expect(zone.className).toMatch(/_outlineWidth-2px/);
    expect(zone.className).toMatch(/_outlineStyle-solid/);
    expect(zone.className).toMatch(/_outlineOffset-0px/);

    // …restated in the focus-visible layer, so the kill cannot outrank it.
    expect(zone.className).toMatch(/_outlineWidth-0focus-visible-2px/);
    expect(zone.className).toMatch(/_outlineStyle-0focus-visible-solid/);
    // …and the zeroing atoms are gone from that layer while the ring is up.
    expect(zone.className).not.toMatch(/_outlineWidth-0focus-visible-0px/);
    expect(zone.className).not.toMatch(/_outlineStyle-0focus-visible-none/);
  });

  it('keeps Choose File out of the tab order so the dropzone is the one stop', () => {
    const result = renderWithProviders(<FileUpload label="Attachment" name="attachment" buttonText="Pick file" />);
    const pick = result.findTextElement('Pick file');
    const pickControl = pick?.closest('[role="button"]') as HTMLElement | null;
    expect(pickControl?.getAttribute('tabindex')).toBe('-1');
  });

  it('shows a drop overlay on drag enter without changing the dropzone border width', () => {
    const result = renderWithProviders(<FileUpload label="Attachment" name="attachment" />);
    const dropzone = result.container.querySelector('[data-file-upload="dropzone"]') as HTMLElement | null;
    expect(dropzone).toBeTruthy();
    const restWidth = getComputedStyle(dropzone as HTMLElement).borderTopWidth;

    fireEvent.dragEnter(dropzone as HTMLElement, {
      dataTransfer: { files: [], types: ['Files'] },
    });

    expect(dropzone?.getAttribute('data-drag-over')).toBe('true');
    expect(result.container.querySelector('[data-file-upload="overlay"]')).toBeTruthy();
    expect(result.findTextElement('Drop a file to upload')).toBeDefined();
    expect(getComputedStyle(dropzone as HTMLElement).borderTopWidth).toBe(restWidth);
  });

  it('keeps per-file remove in the tab order after a file is chosen', async () => {
    const result = renderWithProviders(<FileUpload label="Attachment" name="attachment" />);
    const input = result.container.querySelector("input[type='file']") as HTMLInputElement | null;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await act(async () => {
      if (input) {
        fireEvent.change(input, { target: { files: [file] } });
      }
    });

    const dropzone = result.container.querySelector('[data-file-upload="dropzone"]') as HTMLElement;
    const nested = Array.from(dropzone.querySelectorAll('[role="button"]')).filter((el) => el !== dropzone);
    const removeStops = nested.filter((el) => el.getAttribute('tabindex') !== '-1');
    expect(removeStops.length).toBeGreaterThan(0);
  });
});

// ── Bento-derived dropzone treatment ──────────────────────────────────
// Boards media-01..04 are the numeric spec. Assertions
// ride Tamagui's atomic classes (token-level — the classes name the token and
// the scheme flips the var) plus the house theme table for per-scheme values,
// the Progress intent-spec precedent.
describe('FileUpload bento-derived dropzone', () => {
  it.each(['light', 'dark'] as const)(
    'draws the dash 1px DASHED $color9 in the %s scheme (boards: rgb(77,77,77) light / rgb(133,133,133) dark)',
    (scheme) => {
      const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />, scheme);
      const zone = getZone(container);
      // The dash rides the legible $color9 step, not the near-invisible
      // $borderColor hairline the pre-Bento zone drew.
      expect(zone.className).toMatch(/_btc-color9/);
      expect(zone.className).not.toMatch(/_btc-borderColor/);
      // 1px DASHED (media-01 dz-rest: borderTopWidth 1px, borderTopStyle dashed)
      expect(zone.className).toMatch(/-dashed/);
      expect(zone.className).toMatch(/_btw-1px/);
      // The token resolves to a real per-scheme value on the house table, and
      // it is NOT the $borderColor tier the old dash used.
      const theme = houseThemes[scheme];
      expect(theme.color9).toBeTruthy();
      expect(theme.color9).not.toBe(theme.borderColor);
    },
  );

  it.each(['light', 'dark'] as const)(
    'keeps the zone ground transparent at rest in the %s scheme; only the disabled wash paints it',
    (scheme) => {
      const rest = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />, scheme);
      const restZone = getZone(rest.container);
      // Transparent ground: no rest-state background atom other than
      // `transparent` (hover/press state atoms are allowed — the held mpo
      // $color4 hover flood is a state, not a ground).
      expect(restZone.className).toMatch(/_bg-transparent/);
      expect(restZone.className).not.toMatch(/_bg-(?!transparent|0hover|0active|0focus)/);

      const disabled = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" disabled />, scheme);
      const disabledZone = getZone(disabled.container);
      // keepLabel surface wash: $color3 fill on a $color6 edge.
      expect(disabledZone.className).toMatch(/_bg-color3/);
      expect(disabledZone.className).toMatch(/_btc-color6/);
    },
  );

  it('renders no standalone glyph — the CTA carries the upload mark inside the 44 control', () => {
    const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />);
    const zone = getZone(container);
    // The CTA is the house 44 control (held exception: Bento draws 36/$3).
    const cta = zone.querySelector('[data-mp-button-height]') as HTMLElement;
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('data-mp-button-height')).toBe('44');
    // Every svg in the empty zone lives INSIDE the CTA — no standalone glyph.
    const svgs = Array.from(zone.querySelectorAll('svg'));
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(cta.contains(svg)).toBe(true);
    }
    // The caption sits below the CTA in the zone.
    expect(zone.textContent).toContain('Drag a file into this area');
  });

  it('renders picked files as in-zone rows: name, bold size line, filled $color12 remove disc (32 painted, hitSlop 44)', async () => {
    const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />);
    await pickFile(container, new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const zone = getZone(container);
    // Rows live IN the zone, parted by the same dashed $color9 hairline —
    // not the pre-Bento solid $color8 divider.
    const flist = zone.querySelector('[data-file-upload="files"]') as HTMLElement;
    expect(flist).toBeTruthy();
    expect(flist.className).toMatch(/_btc-color9/);
    expect(flist.className).toMatch(/-dashed/);
    expect(flist.className).not.toMatch(/_btc-color8/);

    // Name renders at body; the size is a SECOND LINE, BOLD.
    expect(flist.textContent).toContain('hello.txt');
    const sizeLine = Array.from(flist.querySelectorAll('span, div, p')).find((el) =>
      /^5 Bytes$/.test(el.textContent ?? ''),
    ) as HTMLElement;
    expect(sizeLine).toBeTruthy();
    expect(sizeLine.className).toMatch(/_fow-700/);

    // Remove: a circular filled $color12 disc painted at nestedControl (32)
    // with hitSlop restoring the 44 floor (data-mp-press-slop 6 → 32+12=44).
    const remove = flist.querySelector('[aria-label="Remove hello.txt"]') as HTMLElement;
    expect(remove).toBeTruthy();
    expect(remove.getAttribute('data-nested-px')).toBe('32');
    expect(remove.getAttribute('data-mp-press-slop')).toBe('6');
    expect(remove.className).toMatch(/_bg-color12/);
    // The inverse ✕ rides inside the disc.
    expect(remove.querySelector('svg')).toBeTruthy();
    // The caption is dropped once files exist; the CTA stays.
    expect(zone.textContent).not.toContain('Drag a file into this area');
    expect(zone.textContent).toContain('Choose File');
  });

  it('hangs the file list off ONE top hairline — bottom/left/right are 0, not the UA 3px initial', async () => {
    const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" />);
    await pickFile(container, new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const zone = getZone(container);
    const flist = zone.querySelector('[data-file-upload="files"]') as HTMLElement;
    expect(flist).toBeTruthy();

    // The frame declares `borderStyle: dashed` for all four sides. A side that
    // declares no width therefore does not render nothing — it renders the CSS
    // initial `medium` (3px) in `currentColor` ($color12), which is a heavy
    // dashed BOX around the picked files instead of the one hairline the
    // divider contract asks for.
    expect(borderWidthAtomPx(flist, '_btw-')).toBe(1);
    for (const prefix of ['_bbw-', '_blw-', '_brw-'] as const) {
      expect(borderWidthAtomPx(flist, prefix)).toBe(0);
    }
  });

  it('keeps compact a space-only dial — CTA stays 44 and remove stays nested 32', async () => {
    const { container } = renderWithHouseThemes(<FileUpload label="Attachment" name="attachment" compact />);
    const zone = getZone(container);
    const cta = zone.querySelector('[data-mp-button-height]') as HTMLElement;
    expect(cta.getAttribute('data-mp-button-height')).toBe('44');

    await pickFile(container, new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    const remove = zone.querySelector('[aria-label="Remove hello.txt"]') as HTMLElement;
    expect(remove.getAttribute('data-nested-px')).toBe('32');
    expect(remove.getAttribute('data-mp-press-slop')).toBe('6');
  });

  it('renders image picks with an in-zone preview thumb at the nested-chrome step', async () => {
    if (typeof URL.createObjectURL !== 'function') {
      (URL as any).createObjectURL = () => 'blob:mock';
      (URL as any).revokeObjectURL = () => {};
    }
    const { container } = renderWithHouseThemes(
      <FileUpload label="Attachment" name="attachment" accept="image/*" showPreview />,
    );
    await pickFile(container, new File(['fake-png-bytes'], 'diagram.png', { type: 'image/png' }));

    const zone = getZone(container);
    const flist = zone.querySelector('[data-file-upload="files"]') as HTMLElement;
    expect(flist).toBeTruthy();
    const thumb = flist.querySelector('img') as HTMLImageElement;
    expect(thumb).toBeTruthy();
    expect(thumb.getAttribute('alt')).toBe('diagram.png');

    // AC-4 image clause (Bento Image Picker): an image pick is a TILE in the
    // in-zone grid, not a row — the thumb IS the tile, and the remove disc
    // rides its top-right corner (absolute, negative inset) instead of
    // trailing on a row. Same 32/hitSlop-44 disc the rows carry.
    const grid = flist.querySelector('[data-file-upload="tiles"]') as HTMLElement;
    expect(grid).toBeTruthy();
    const tile = grid.querySelector('[data-file-upload="tile"]') as HTMLElement;
    expect(tile).toBeTruthy();
    expect(tile.contains(thumb)).toBe(true);
    const remove = tile.querySelector('[aria-label="Remove diagram.png"]') as HTMLElement;
    expect(remove).toBeTruthy();
    expect(remove.getAttribute('data-nested-px')).toBe('32');
    expect(remove.getAttribute('data-mp-press-slop')).toBe('6');
    const corner = tile.querySelector('[data-file-upload="tile-remove"]') as HTMLElement;
    expect(corner).toBeTruthy();
    expect(corner.contains(remove)).toBe(true);
    expect(corner.className).toMatch(/_pos-absolute/);
    // No size line inside a tile: Bento's populated Image Picker is thumbs only.
    expect(tile.textContent ?? '').not.toMatch(/Bytes|KB|MB/);
  });

  it('keeps non-image picks as rows while images tile — one list, two treatments', async () => {
    if (typeof URL.createObjectURL !== 'function') {
      (URL as any).createObjectURL = () => 'blob:mock';
      (URL as any).revokeObjectURL = () => {};
    }
    const { container } = renderWithHouseThemes(
      <FileUpload label="Attachment" name="attachment" multiple showPreview />,
    );
    await pickFile(container, new File(['fake-png-bytes'], 'diagram.png', { type: 'image/png' }));
    await pickFile(container, new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    const zone = getZone(container);
    const flist = zone.querySelector('[data-file-upload="files"]') as HTMLElement;
    const tiles = flist.querySelectorAll('[data-file-upload="tile"]');
    expect(tiles.length).toBe(1);
    // The text file is a row with its bold size line and trailing disc, outside the grid.
    const grid = flist.querySelector('[data-file-upload="tiles"]') as HTMLElement;
    const rowRemove = flist.querySelector('[aria-label="Remove notes.txt"]') as HTMLElement;
    expect(rowRemove).toBeTruthy();
    expect(grid.contains(rowRemove)).toBe(false);
    expect(flist.textContent).toContain('notes.txt');
  });
});

// ── Transfer lifecycle ────────────────────────────────────────────────
// A chosen file used to jump straight into the populated list. The
// in-flight row (name, size, progress, cancel) sits between choose and
// commit; a transport failure keeps the file visible with retry + remove
// and does not clear siblings. Cancel drops only the in-flight row.
describe('FileUpload transfer lifecycle', () => {
  it('renders an in-flight row (name, size, progress, cancel) between choose and populated', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onChange = vi.fn();
    const { container } = renderWithHouseThemes(
      <FileUpload
        label="Attachment"
        name="attachment"
        onChange={onChange}
        onUpload={async (_file, { onProgress }) => {
          onProgress(42);
          await held;
        }}
      />,
    );

    await pickFile(container, new File(['hello'], 'restore-log.txt', { type: 'text/plain' }));

    const flist = container.querySelector('[data-file-upload="files"]') as HTMLElement;
    expect(flist).toBeTruthy();
    expect(flist.textContent).toContain('restore-log.txt');
    expect(flist.textContent).toMatch(/5 Bytes/);
    const bar = flist.querySelector('[data-file-upload="progress"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(flist.querySelector('[aria-label="Cancel restore-log.txt"]')).toBeTruthy();
    expect(flist.querySelector('[aria-label="Remove restore-log.txt"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    release();
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Remove restore-log.txt"]')).toBeTruthy();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as File).name).toBe('restore-log.txt');
  });

  it('renders a failed row with retry and remove, leaving committed files intact', async () => {
    const onUpload = vi.fn(async (file: File) => {
      if (file.name === 'wazuh-dump.sql') {
        throw new Error('413 Payload Too Large');
      }
    });
    const { container } = renderWithHouseThemes(
      <FileUpload label="Attachment" name="attachment" multiple onUpload={onUpload} />,
    );

    await pickFile(container, new File(['ok'], 'compose01.txt', { type: 'text/plain' }));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Remove compose01.txt"]')).toBeTruthy();
    });

    await pickFile(container, new File(['big'], 'wazuh-dump.sql', { type: 'text/plain' }));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Retry wazuh-dump.sql"]')).toBeTruthy();
    });

    const flist = container.querySelector('[data-file-upload="files"]') as HTMLElement;
    expect(flist.textContent).toContain('413 Payload Too Large');
    expect(flist.textContent).toContain('Try again or remove the file');
    expect(flist.querySelector('[aria-label="Remove compose01.txt"]')).toBeTruthy();
    expect(flist.querySelector('[aria-label="Remove wazuh-dump.sql"]')).toBeTruthy();
    expect(flist.querySelector('[data-transfer-status="failed"]')).toBeTruthy();
  });

  it('cancel during transfer removes the in-flight row without touching committed files', async () => {
    let hold!: () => void;
    const held = new Promise<void>((resolve) => {
      hold = resolve;
    });
    const onChange = vi.fn();
    const onUpload = vi.fn(async (file: File, { onProgress }: { onProgress: (n: number) => void }) => {
      if (file.name === 'in-flight.bin') {
        onProgress(10);
        await held;
      }
    });
    const { container } = renderWithHouseThemes(
      <FileUpload label="Attachment" name="attachment" multiple onChange={onChange} onUpload={onUpload} />,
    );

    await pickFile(container, new File(['ok'], 'kept.txt', { type: 'text/plain' }));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Remove kept.txt"]')).toBeTruthy();
    });
    const committedCalls = onChange.mock.calls.length;

    await pickFile(container, new File(['xx'], 'in-flight.bin', { type: 'text/plain' }));
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Cancel in-flight.bin"]')).toBeTruthy();
    });

    await act(async () => {
      const cancel = container.querySelector('[aria-label="Cancel in-flight.bin"]') as HTMLElement;
      fireEvent.click(cancel);
    });

    expect(container.querySelector('[aria-label="Cancel in-flight.bin"]')).toBeNull();
    expect(container.querySelector('[data-file-upload="progress"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove kept.txt"]')).toBeTruthy();
    expect(container.textContent).toContain('kept.txt');
    expect(container.textContent).not.toContain('in-flight.bin');
    expect(onChange.mock.calls.length).toBe(committedCalls);
    hold();
  });
});
