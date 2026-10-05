import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Paragraph, YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FeedLayout,
  ListDetailLayout,
  PaneScaffold,
  ReadingWidth,
  SupportingPaneLayout,
  type PaneScaffoldProps,
} from './PaneScaffold';

import * as Layouts from './index';

afterEach(cleanup);

const originalInnerWidth = window.innerWidth;

/** Drive the real size-class path from a viewport width (setup reads it at render). */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

afterEach(() => {
  setViewportWidth(originalInnerWidth);
});

/**
 * Rail | (centre | inspector) — the three-region page the kit composes from
 * two scaffolds. `sizeClass` is set on the OUTER one only, so this also
 * covers whether the class reaches the inner scaffold.
 */
function ThreeRegionPage(props: { sizeClass?: 'compact' | 'medium' | 'expanded' | 'large' | 'xl' }) {
  return (
    <PaneScaffold
      sizeClass={props.sizeClass}
      primary={<Paragraph>Rail</Paragraph>}
      secondary=<PaneScaffold primary={<Paragraph>Centre</Paragraph>} secondary={<Paragraph>Inspector</Paragraph>} />
    />
  );
}

describe('layouts index exports (W11)', () => {
  it('exports PaneScaffold canonical layouts + ReadingWidth', () => {
    expect(Layouts.PaneScaffold).toBe(PaneScaffold);
    expect(Layouts.ListDetailLayout).toBe(ListDetailLayout);
    expect(Layouts.SupportingPaneLayout).toBe(SupportingPaneLayout);
    expect(Layouts.FeedLayout).toBe(FeedLayout);
    expect(Layouts.ReadingWidth).toBe(ReadingWidth);
  });
});

describe('PaneScaffold', () => {
  it('stacks both panes below the two-pane budget', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="compact"
        primary={<Paragraph>List</Paragraph>}
        secondary={<Paragraph>Detail</Paragraph>}
      />,
    );
    const root = screen.getByTestId('pane-scaffold');
    expect(root).toHaveAttribute('data-panes', '2');
    expect(root).toHaveAttribute('data-pane-layout', 'stack');
    expect(screen.getByTestId('pane-primary')).toHaveTextContent('List');
    expect(screen.getByTestId('pane-secondary')).toHaveTextContent('Detail');
  });

  it('drops the sash when stacked (nothing to drag with a thumb)', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="compact"
        primary={<Paragraph>List</Paragraph>}
        secondary={<Paragraph>Detail</Paragraph>}
      />,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-sash', 'false');
    expect(screen.queryByTestId('pane-sash')).not.toBeInTheDocument();
  });

  it('narrowLayout=swap drops the inactive pane', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="compact"
        narrowLayout="swap"
        primary={<Paragraph>List</Paragraph>}
        secondary={<Paragraph>Detail</Paragraph>}
      />,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-panes', '1');
    expect(screen.queryByText('Detail')).not.toBeInTheDocument();
  });

  it('honors activePane=secondary on single-pane', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="medium"
        activePane="secondary"
        primary={<Paragraph>List</Paragraph>}
        secondary={<Paragraph>Detail</Paragraph>}
      />,
    );
    expect(screen.getByText('Detail')).toBeInTheDocument();
    expect(screen.queryByText('List')).not.toBeInTheDocument();
  });

  it('shows two panes from expanded (860) up', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="expanded"
        primary={<Paragraph>List</Paragraph>}
        secondary={<Paragraph>Detail</Paragraph>}
      />,
    );
    const root = screen.getByTestId('pane-scaffold');
    expect(root).toHaveAttribute('data-panes', '2');
    expect(root).toHaveAttribute('data-size-class', 'expanded');
    expect(screen.getByTestId('pane-primary')).toHaveTextContent('List');
    expect(screen.getByTestId('pane-secondary')).toHaveTextContent('Detail');
  });

  it('maxPanes=1 takes the narrow path even when expanded', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="xl"
        maxPanes={1}
        primary={<Paragraph>Only</Paragraph>}
        secondary={<Paragraph>Also</Paragraph>}
      />,
    );
    const root = screen.getByTestId('pane-scaffold');
    expect(root).toHaveAttribute('data-pane-layout', 'stack');
    expect(screen.getByText('Also')).toBeInTheDocument();
  });

  it('maxPanes=1 with activePane drops the other pane', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="xl"
        maxPanes={1}
        activePane="primary"
        primary={<Paragraph>Only</Paragraph>}
        secondary={<Paragraph>Hidden</Paragraph>}
      />,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-panes', '1');
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

// Two scaffolds are how the kit builds three regions, and a phone
// rendered only the outer primary — the centre and inspector were unreachable.
describe('PaneScaffold nesting', () => {
  it('renders all three regions at a 402pt viewport', () => {
    setViewportWidth(402);
    renderWithProviders(<ThreeRegionPage />);

    expect(screen.getByText('Rail')).toBeInTheDocument();
    expect(screen.getByText('Centre')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();

    const scaffolds = screen.getAllByTestId('pane-scaffold');
    expect(scaffolds).toHaveLength(2);
    for (const node of scaffolds) {
      expect(node).toHaveAttribute('data-pane-layout', 'stack');
      expect(node).toHaveAttribute('data-size-class', 'compact');
    }
    expect(screen.queryAllByTestId('pane-sash')).toHaveLength(0);
  });

  it('passes the outer size class to the inner scaffold', () => {
    // Viewport stays wide: only the outer override may narrow the inner one.
    setViewportWidth(1440);
    renderWithProviders(<ThreeRegionPage sizeClass="compact" />);

    expect(screen.getByText('Centre')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    for (const node of screen.getAllByTestId('pane-scaffold')) {
      expect(node).toHaveAttribute('data-pane-layout', 'stack');
    }
  });

  it('still splits both scaffolds when the viewport is wide', () => {
    setViewportWidth(1440);
    renderWithProviders(<ThreeRegionPage />);

    const scaffolds = screen.getAllByTestId('pane-scaffold');
    expect(scaffolds).toHaveLength(2);
    for (const node of scaffolds) {
      expect(node).toHaveAttribute('data-pane-layout', 'split');
    }
    expect(screen.getAllByTestId('pane-sash')).toHaveLength(2);
  });
});

describe('ListDetailLayout', () => {
  it('keeps the swap idiom on compact: list only until an item is picked', () => {
    renderWithProviders(
      <ListDetailLayout
        sizeClass="compact"
        list={<Paragraph>Items</Paragraph>}
        detail={<Paragraph>Item 1</Paragraph>}
      />,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-panes', '1');
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });

  it('flips to detail when selected on compact', () => {
    renderWithProviders(
      <ListDetailLayout
        sizeClass="compact"
        selected
        list={<Paragraph>Items</Paragraph>}
        detail={<Paragraph>Item 1</Paragraph>}
      />,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Items')).not.toBeInTheDocument();
  });
});

describe('SupportingPaneLayout', () => {
  it('stacks the supporting pane on compact instead of hiding it', () => {
    renderWithProviders(
      <SupportingPaneLayout sizeClass="compact" supporting={<Paragraph>Meta</Paragraph>}>
        <Paragraph>Body</Paragraph>
      </SupportingPaneLayout>,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-pane-layout', 'stack');
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('renders side-by-side at large', () => {
    renderWithProviders(
      <SupportingPaneLayout sizeClass="large" supporting={<Paragraph>Meta</Paragraph>}>
        <Paragraph>Body</Paragraph>
      </SupportingPaneLayout>,
    );
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-panes', '2');
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });
});

describe('FeedLayout', () => {
  it('renders feed items', () => {
    renderWithProviders(
      <FeedLayout>
        <YStack>
          <Paragraph>A</Paragraph>
        </YStack>
        <YStack>
          <Paragraph>B</Paragraph>
        </YStack>
      </FeedLayout>,
    );
    expect(screen.getByTestId('feed-layout')).toHaveAttribute('data-canonical', 'feed');
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('ReadingWidth', () => {
  it('applies ~70ch maxWidth by default', () => {
    renderWithProviders(
      <ReadingWidth>
        <Paragraph>Prose</Paragraph>
      </ReadingWidth>,
    );
    const el = screen.getByTestId('reading-width');
    expect(el).toHaveStyle({ maxWidth: '70ch' });
  });
});

// The seam runs on one axis. A vertical scaffold docks secondary
// under primary with the sash, clamps and fraction contract the side-by-side
// split already has, turned on its side.
describe('PaneScaffold orientation', () => {
  function renderSplit(props: Partial<PaneScaffoldProps> = {}) {
    renderWithProviders(
      <PaneScaffold
        sizeClass="expanded"
        primary={<Paragraph>Body</Paragraph>}
        secondary={<Paragraph>Editor</Paragraph>}
        {...props}
      />,
    );
    return screen.getByTestId('pane-sash');
  }

  function boundRow(width: number, height: number) {
    const row = screen.getByTestId('pane-primary').parentElement as HTMLElement;
    row.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it('docks secondary under primary behind a horizontal sash', () => {
    const sash = renderSplit({ orientation: 'vertical' });
    const root = screen.getByTestId('pane-scaffold');
    expect(root).toHaveAttribute('data-orientation', 'vertical');
    expect(root).toHaveAttribute('data-pane-layout', 'split');
    expect(root).toHaveAttribute('data-sash', 'true');
    expect(sash).toHaveAttribute('aria-orientation', 'horizontal');
    const primary = screen.getByTestId('pane-primary');
    const secondary = screen.getByTestId('pane-secondary');
    expect(primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the side-by-side sash vertical by default', () => {
    const sash = renderSplit();
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-orientation', 'horizontal');
    expect(sash).toHaveAttribute('aria-orientation', 'vertical');
  });

  it.each([
    ['horizontal', 'ArrowRight', 'ArrowLeft'],
    ['vertical', 'ArrowDown', 'ArrowUp'],
  ] as const)('%s: arrows step the fraction along its own axis', (orientation, forward, back) => {
    const sash = renderSplit({ orientation });
    expect(sash).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(sash, { key: forward });
    expect(sash).toHaveAttribute('aria-valuenow', '52');
    fireEvent.keyDown(sash, { key: forward, shiftKey: true });
    expect(sash).toHaveAttribute('aria-valuenow', '62');
    fireEvent.keyDown(sash, { key: back });
    expect(sash).toHaveAttribute('aria-valuenow', '60');
    fireEvent.keyDown(sash, { key: 'Enter' });
    expect(sash).toHaveAttribute('aria-valuenow', '50');
  });

  it('vertical ignores the horizontal arrows', () => {
    const sash = renderSplit({ orientation: 'vertical' });
    fireEvent.keyDown(sash, { key: 'ArrowRight' });
    fireEvent.keyDown(sash, { key: 'ArrowLeft' });
    expect(sash).toHaveAttribute('aria-valuenow', '50');
  });

  it('vertical honours the clamps: the default is clamped, Home / End land on min / max', () => {
    const sash = renderSplit({
      orientation: 'vertical',
      paneFlex: [9, 1],
      minPaneFraction: 0.3,
      maxPaneFraction: 0.7,
    });
    expect(sash).toHaveAttribute('aria-valuemin', '30');
    expect(sash).toHaveAttribute('aria-valuemax', '70');
    expect(sash).toHaveAttribute('aria-valuenow', '70');
    fireEvent.keyDown(sash, { key: 'Home' });
    expect(sash).toHaveAttribute('aria-valuenow', '30');
    fireEvent.keyDown(sash, { key: 'End' });
    expect(sash).toHaveAttribute('aria-valuenow', '70');
  });

  it('vertical is controlled through primaryFraction / onPrimaryFractionChange', () => {
    const onChange = vi.fn();
    const sash = renderSplit({
      orientation: 'vertical',
      primaryFraction: 0.4,
      onPrimaryFractionChange: onChange,
    });
    expect(sash).toHaveAttribute('aria-valuenow', '40');
    fireEvent.keyDown(sash, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeCloseTo(0.42);
    expect(sash).toHaveAttribute('aria-valuenow', '40');
  });

  it.each([
    ['horizontal', { clientX: 200, clientY: 0 }, { clientX: 280, clientY: 0 }],
    ['vertical', { clientX: 0, clientY: 100 }, { clientX: 0, clientY: 140 }],
  ] as const)('%s: dragging the seam moves the fraction by the distance over the row', (orientation, down, move) => {
    const sash = renderSplit({ orientation });
    boundRow(800, 400);
    fireEvent.pointerDown(sash, { button: 0, ...down });
    fireEvent.pointerMove(window, move);
    expect(sash).toHaveAttribute('aria-valuenow', '60');
    fireEvent.pointerUp(window, move);
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    expect(sash).toHaveAttribute('aria-valuenow', '60');
  });

  it('vertical stacks like horizontal below the two-pane budget', () => {
    renderWithProviders(
      <PaneScaffold
        sizeClass="compact"
        orientation="vertical"
        primary={<Paragraph>Body</Paragraph>}
        secondary={<Paragraph>Editor</Paragraph>}
      />,
    );
    const root = screen.getByTestId('pane-scaffold');
    expect(root).toHaveAttribute('data-pane-layout', 'stack');
    expect(root).toHaveAttribute('data-orientation', 'vertical');
    expect(screen.queryByTestId('pane-sash')).not.toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  it('vertical keeps the seam on a narrow window when maxPanes ejects', () => {
    const sash = renderSplit({ orientation: 'vertical', sizeClass: 'compact', maxPanes: 2 });
    expect(screen.getByTestId('pane-scaffold')).toHaveAttribute('data-pane-layout', 'split');
    expect(sash).toHaveAttribute('aria-orientation', 'horizontal');
  });
});
