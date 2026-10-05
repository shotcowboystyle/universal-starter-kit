import { renderWithProviders } from '@repo/test-utils';
import { Preset, type Knobs } from '@repo/theme';
/**
 * The FloatingPanel family's anchoring and width contract (the
 * cover ruling).
 *
 * COVER is the defining behaviour: a panel attaches to the trigger it was
 * opened from and does not float clear of it. Before this landed, four
 * members took `OVERLAY_ANCHOR_GAP` and measured 3.96–4.00px of daylight
 * between trigger bottom and panel top.
 *
 * WIDTH is three declared modes, not a boolean. `fit-content` ignores the
 * trigger; `match-trigger` is the trigger's width EXACTLY for content both
 * narrower and wider; `at-least-trigger` (the default) is max(trigger,
 * content) — the floor that keeps a panel from coming out narrower than the
 * control that opened it.
 */
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type PanelWidthMode,
  measureDrawnRadius,
  panelAnchorOffset,
  resolvePanelWidthMode,
  useFloatingPanel,
} from './useFloatingPanel';

function Harness({ open, fitContent, widthMode }: { open: boolean; fitContent?: boolean; widthMode?: PanelWidthMode }) {
  const panel = useFloatingPanel({
    open,
    onOpenChange: () => {},
    useAutoUpdate: false,
    fitContent,
    widthMode,
  });
  return (
    <>
      <div data-testid="anchor-trigger" ref={panel.setReferenceRef} />
      {panel.mounted && (
        <div data-testid="anchor-floating" data-panel-y={String(panel.y)} ref={panel.refs.setFloating} />
      )}
    </>
  );
}

function mockRect(el: HTMLElement, rect: { x: number; y: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** Open the panel against a trigger of a known geometry and hand back the
 *  floating element once floating-ui has positioned it. */
async function openAgainstTrigger(
  props: { fitContent?: boolean; widthMode?: PanelWidthMode },
  triggerRect: { x: number; y: number; width: number; height: number },
) {
  const result = renderWithProviders(<Harness open={false} {...props} />);
  mockRect(result.getByTestId('anchor-trigger'), triggerRect);
  result.rerender(<Harness open {...props} />);
  await waitFor(() => {
    expect(result.getByTestId('anchor-floating')).toBeTruthy();
  });
  return result;
}

const trigger = { x: 16, y: 16, width: 240, height: 44 };

describe('FloatingPanel anchoring (cover ruling)', () => {
  it('attaches to the trigger with no gap', () => {
    // The house token IS the contract; a member cannot opt back into 4px
    // without changing the token every member reads.
    expect(panelAnchorOffset).toBe(0);
  });

  it("places the panel top on the trigger's bottom edge, not 4px below it", async () => {
    const result = await openAgainstTrigger({}, trigger);
    await waitFor(() => {
      const y = Number(result.getByTestId('anchor-floating').dataset.panelY);
      // trigger.bottom = 16 + 44 = 60. Anything larger is daylight.
      expect(y).toBe(60);
    });
  });
});

describe('FloatingPanel width modes', () => {
  it('resolves the deprecated boolean onto the three modes', () => {
    expect(resolvePanelWidthMode(undefined, undefined)).toBe('at-least-trigger');
    expect(resolvePanelWidthMode(undefined, false)).toBe('at-least-trigger');
    expect(resolvePanelWidthMode(undefined, true)).toBe('fit-content');
    // An explicit mode always wins over the boolean, in both directions.
    expect(resolvePanelWidthMode('match-trigger', true)).toBe('match-trigger');
    expect(resolvePanelWidthMode('fit-content', false)).toBe('fit-content');
  });

  it('at-least-trigger writes min-width only, so content may still grow it', async () => {
    const result = await openAgainstTrigger({ widthMode: 'at-least-trigger' }, trigger);
    await waitFor(() => {
      const el = result.getByTestId('anchor-floating');
      expect(el.style.minWidth).toBe('240px');
      expect(el.style.width).toBe('');
      expect(el.style.maxWidth).toBe('');
    });
  });

  it('at-least-trigger is what the bare default means', async () => {
    const result = await openAgainstTrigger({}, trigger);
    await waitFor(() => {
      expect(result.getByTestId('anchor-floating').style.minWidth).toBe('240px');
    });
  });

  it('at-least-trigger is what an explicit fitContent={false} means', async () => {
    const result = await openAgainstTrigger({ fitContent: false }, trigger);
    await waitFor(() => {
      expect(result.getByTestId('anchor-floating').style.minWidth).toBe('240px');
    });
  });

  it('match-trigger pins the width exactly — narrow content cannot shrink it', async () => {
    const result = await openAgainstTrigger({ widthMode: 'match-trigger' }, trigger);
    await waitFor(() => {
      const el = result.getByTestId('anchor-floating');
      expect(el.style.width).toBe('240px');
      expect(el.style.minWidth).toBe('240px');
      expect(el.style.maxWidth).toBe('240px');
    });
  });

  it('match-trigger pins the width exactly — wide content cannot grow it', async () => {
    // max-width is the half at-least-trigger does not write, and it is the
    // half that stops a wide option list from overflowing the trigger.
    const wide = { x: 16, y: 16, width: 96, height: 44 };
    const result = await openAgainstTrigger({ widthMode: 'match-trigger' }, wide);
    await waitFor(() => {
      expect(result.getByTestId('anchor-floating').style.maxWidth).toBe('96px');
    });
  });

  it('fit-content leaves every width channel alone', async () => {
    const result = await openAgainstTrigger({ widthMode: 'fit-content' }, trigger);
    const el = result.getByTestId('anchor-floating');
    expect(el.style.minWidth).toBe('');
    expect(el.style.width).toBe('');
    expect(el.style.maxWidth).toBe('');
  });

  it('fitContent still reaches fit-content, so existing consumers do not move', async () => {
    const result = await openAgainstTrigger({ fitContent: true }, trigger);
    expect(result.getByTestId('anchor-floating').style.minWidth).toBe('');
  });
});

/**
 * Drawn-radius equality.
 *
 * The panel wears the arc the TRIGGER actually draws, and the box the panel
 * anchors to is not always the box that paints. `FloatingPanelWeb` hands
 * `setReferenceRef` to a layout-only `<View>` around the caller's `trigger`
 * slot, so reading the anchor's own computed radius returned 0px and
 * `min(0, h/2, w/2)` pinned every consumer's panel to a square corner at
 * EVERY stop — measured on origin/main 3bb889f32: trigger 5/9/16/50px,
 * panel 0px, in light and dark.
 *
 * These cases lock the three behaviours that fix depends on, so the zero
 * cannot come back: the anchor's own paint wins when it has one (the
 * Select/Combobox path, which was never broken), an unpainted anchor
 * descends to the box sharing its corner, and an anchor with nothing painted
 * anywhere returns null so the caller falls back to the CLAMPED TOKEN rather
 * than to zero.
 *
 * FIXTURE FIDELITY, and it is load-bearing. jsdom reports an UNSET
 * `borderTopLeftRadius` as the empty string; a browser reports "0px". The old
 * implementation ran `parseFloat` on that value, so on an unstyled jsdom node
 * it saw NaN and returned null — accidentally the right answer — while in a
 * browser it saw 0 and returned a measured 0 that beat the token fallback.
 * That is the bug. So every layout-only wrapper below sets
 * `borderTopLeftRadius: "0px"` explicitly: without it these cases pass against
 * the broken implementation and lock nothing.
 */
function boxed(
  el: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
  style: Partial<CSSStyleDeclaration>,
) {
  mockRect(el, rect);
  Object.assign(el.style, style);
  return el;
}

/** jsdom resolves computed style only for ATTACHED nodes, and the fix reads
 *  computed style — so the fixture has to live in the document. */
function mounted(el: HTMLElement) {
  document.body.appendChild(el);
  return el;
}

describe('FloatingPanel drawn radius', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the anchor itself when the anchor is the painted control', () => {
    // Select and Combobox spread the reference onto InputParts.Box. That path
    // was correct before this fix and must stay byte-for-byte correct after.
    const anchor = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          borderTopLeftRadius: '9px',
          backgroundColor: 'rgb(255, 255, 255)',
        },
      ),
    );
    expect(measureDrawnRadius(anchor)).toBe(9);
  });

  it('descends to the painted trigger when the anchor is a layout-only wrapper', () => {
    // The regression itself: wrapper draws nothing, Button draws 16px.
    const wrapper = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          // A browser reports "0px" here; jsdom leaves it "". Without this the
          // fixture is not the box the bug happens on — see the note above.
          borderTopLeftRadius: '0px',
          cursor: 'pointer',
          opacity: '1',
        },
      ),
    );
    const button = boxed(
      document.createElement('div'),
      { x: 0, y: 0, width: 240, height: 44 },
      {
        borderTopLeftRadius: '16px',
        backgroundColor: 'rgb(240, 240, 240)',
      },
    );
    wrapper.appendChild(button);
    expect(measureDrawnRadius(wrapper)).toBe(16);
  });

  it("clamps the descended radius to the painted trigger's own half-height", () => {
    // `full` asks for 50px on a 44px control; CSS draws 22px, so the panel
    // must draw 22px too — matching a 50px arc would not coincide.
    const wrapper = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          // A browser reports "0px" here; jsdom leaves it "". Without this the
          // fixture is not the box the bug happens on — see the note above.
          borderTopLeftRadius: '0px',
          cursor: 'pointer',
        },
      ),
    );
    const button = boxed(
      document.createElement('div'),
      { x: 0, y: 0, width: 240, height: 44 },
      {
        borderTopLeftRadius: '50px',
        backgroundColor: 'rgb(240, 240, 240)',
      },
    );
    wrapper.appendChild(button);
    expect(measureDrawnRadius(wrapper)).toBe(22);
  });

  it('keeps a square corner square rather than inventing one', () => {
    const wrapper = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          // A browser reports "0px" here; jsdom leaves it "". Without this the
          // fixture is not the box the bug happens on — see the note above.
          borderTopLeftRadius: '0px',
          cursor: 'pointer',
        },
      ),
    );
    const button = boxed(
      document.createElement('div'),
      { x: 0, y: 0, width: 240, height: 44 },
      {
        borderTopLeftRadius: '0px',
        backgroundColor: 'rgb(240, 240, 240)',
      },
    );
    wrapper.appendChild(button);
    expect(measureDrawnRadius(wrapper)).toBe(0);
  });

  it("ignores a painted descendant that does not share the anchor's corner", () => {
    // An inset swatch is not the corner the panel meets. Nothing else paints,
    // so this resolves to the token fallback, not to the swatch's radius.
    const wrapper = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          // A browser reports "0px" here; jsdom leaves it "". Without this the
          // fixture is not the box the bug happens on — see the note above.
          borderTopLeftRadius: '0px',
          cursor: 'pointer',
        },
      ),
    );
    const swatch = boxed(
      document.createElement('div'),
      { x: 12, y: 12, width: 20, height: 20 },
      {
        borderTopLeftRadius: '10px',
        backgroundColor: 'rgb(255, 0, 0)',
      },
    );
    wrapper.appendChild(swatch);
    expect(measureDrawnRadius(wrapper)).toBeNull();
  });

  it('returns null — never 0 — when nothing under the anchor paints a corner', () => {
    // This is the whole bug in one assertion. A measured 0 wins over the
    // token fallback because `measuredRadius ?? clampDropdownRadius(token)`
    // only falls back on null, so returning 0 here squares every panel.
    const wrapper = mounted(
      boxed(
        document.createElement('div'),
        { x: 0, y: 0, width: 240, height: 44 },
        {
          // A browser reports "0px" here; jsdom leaves it "". Without this the
          // fixture is not the box the bug happens on — see the note above.
          borderTopLeftRadius: '0px',
          cursor: 'pointer',
        },
      ),
    );
    wrapper.appendChild(boxed(document.createElement('span'), { x: 0, y: 0, width: 60, height: 20 }, {}));
    // Guard the premise: if this ever reads "" again the case below goes green
    // against a broken implementation, exactly as it did before.
    expect(getComputedStyle(wrapper).borderTopLeftRadius).toBe('0px');
    expect(measureDrawnRadius(wrapper)).toBeNull();
  });
});

/**
 * CONTAINER-CAP. Floating panels are filed under the container cap: the
 * class value on the panel's own padding is the ceiling, and the trigger's
 * drawn arc (above) only ever lowers it.
 */
function RadiusHarness({ open, compact }: { open: boolean; compact?: boolean }) {
  const panel = useFloatingPanel({ open, onOpenChange: () => {}, useAutoUpdate: false, compact });
  return <div data-testid="radius-trigger" data-radius={String(panel.dropdownRadius)} ref={panel.setReferenceRef} />;
}

function panelRadius(overrides: Partial<Knobs>, compact?: boolean) {
  const result = renderWithProviders(
    <Preset overrides={overrides}>
      <RadiusHarness open={false} compact={compact} />
    </Preset>,
  );
  const radius = result.getByTestId('radius-trigger').getAttribute('data-radius');
  result.unmount();
  return radius;
}

describe('FloatingPanel radius is CONTAINER-CAP on its padding', () => {
  it('takes the token while it fits the padding', () => {
    expect(panelRadius({ borderRadius: 'none' })).toBe('0');
    expect(panelRadius({ borderRadius: 'medium', space: 'medium' })).toBe('9');
    expect(panelRadius({ borderRadius: 'large', space: 'medium' })).toBe('16');
  });

  it('caps full at the padding, and large under space small', () => {
    expect(panelRadius({ borderRadius: 'full', space: 'medium' })).toBe('18');
    expect(panelRadius({ borderRadius: 'full', space: 'large' })).toBe('32');
    expect(panelRadius({ borderRadius: 'large', space: 'small' })).toBe('13');
  });

  it("caps at the compact step's padding for a compact panel", () => {
    expect(panelRadius({ borderRadius: 'full', space: 'medium' }, true)).toBe('13');
    expect(panelRadius({ borderRadius: 'large', space: 'medium' }, true)).toBe('13');
  });

  it('keeps a smaller drawn trigger arc once open, never a larger one', async () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
        <RadiusHarness open={false} />
      </Preset>,
    );
    const anchor = result.getByTestId('radius-trigger');
    mockRect(anchor, { x: 0, y: 0, width: 240, height: 20 });
    Object.assign(anchor.style, {
      borderTopLeftRadius: '10px',
      backgroundColor: 'rgb(255, 255, 255)',
    });
    result.rerender(
      <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
        <RadiusHarness open />
      </Preset>,
    );
    await waitFor(() => {
      expect(anchor.getAttribute('data-radius')).toBe('10');
    });

    Object.assign(anchor.style, { borderTopLeftRadius: '50px' });
    mockRect(anchor, { x: 0, y: 0, width: 240, height: 44 });
    result.rerender(
      <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
        <RadiusHarness open={false} />
      </Preset>,
    );
    result.rerender(
      <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
        <RadiusHarness open />
      </Preset>,
    );
    await waitFor(() => {
      expect(anchor.getAttribute('data-radius')).toBe('18');
    });
  });
});
