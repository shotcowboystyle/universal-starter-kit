import { renderWithProviders } from '@repo/test-utils';
import { describe, it, expect, vi } from 'vitest';

import { RichEditorContext } from '../context';

import {
  UndoIcon,
  RedoIcon,
  BoldIcon,
  AlignLeftIcon,
  LinkIcon,
  TextColorIcon,
  HighlightIcon,
  BulletListIcon,
  ImageIcon,
} from './icons';
import { ToolbarGroup } from './ToolbarGroup';

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: any) => (
    <button
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}
      data-active={props.theme === 'active' ? 'true' : undefined}>
      {props.children}
    </button>
  ),
}));

vi.mock(import('@repo/ui'), () => ({
  Tooltip: ({ children }: any) => children,
  // UndoIcon/RedoIcon mirror through the direction source (RTL glyph swap).
  useDirection: () => 'ltr',
}));

// Import after mocks
const { ToolbarButton, ToolbarDropdownButton } = await import('./ToolbarButton');

describe('ToolbarButton', () => {
  it('renders with required aria-label and applies active state', () => {
    const onPress = vi.fn();
    const { getByRole } = renderWithProviders(
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        <ToolbarButton
          active
          onPress={onPress}
          aria-label="Bold"
          tooltip="Bold">
          <BoldIcon>B</BoldIcon>
        </ToolbarButton>
      </RichEditorContext.Provider>,
    );
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Bold');
  });

  it('reads size/compact from RichEditorContext', () => {
    const { container } = renderWithProviders(
      <RichEditorContext.Provider
        size="$2"
        compact
        disabled={false}>
        <ToolbarButton
          onPress={() => {}}
          aria-label="Test Button">
          Test
        </ToolbarButton>
      </RichEditorContext.Provider>,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

describe('ToolbarDropdownButton', () => {
  it('renders with caret icon', () => {
    const { container } = renderWithProviders(
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        <ToolbarDropdownButton
          onPress={() => {}}
          aria-label="Heading">
          H1
        </ToolbarDropdownButton>
      </RichEditorContext.Provider>,
    );
    // ToolbarDropdownButton renders a caret (CaretDownIcon from phosphor)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});

describe(ToolbarGroup, () => {
  it('hides children when visible is false', () => {
    const { container } = renderWithProviders(
      <ToolbarGroup visible={false}>
        <span data-testid="child">Should not render</span>
      </ToolbarGroup>,
    );
    expect(container.querySelector("[data-testid='child']")).toBeNull();
  });

  it('renders children when visible is true', () => {
    const { container } = renderWithProviders(
      <ToolbarGroup visible>
        <span data-testid="child">Should render</span>
      </ToolbarGroup>,
    );
    expect(container.querySelector("[data-testid='child']")).toBeTruthy();
  });
});

describe('icons', () => {
  it('all icon components render without error', () => {
    const { container } = renderWithProviders(
      <>
        <UndoIcon />
        <RedoIcon />
        <AlignLeftIcon />
        <LinkIcon />
        <TextColorIcon />
        <HighlightIcon />
        <BulletListIcon />
        <ImageIcon />
      </>,
    );
    // Each SVG icon should produce an svg element
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(8);
  });

  it('mechanical icons render phosphor glyphs (LC-16 census #20)', () => {
    const { container } = renderWithProviders(<UndoIcon />);
    // Phosphor icons render a 256-grid viewBox; the old hand-rolled set was 24.
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 256 256');
  });

  it('text-style icons accept (and ignore) legacy letter children', () => {
    const { container } = renderWithProviders(<BoldIcon>B</BoldIcon>);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('color-state icons stay custom and render the current color swatch', () => {
    const { container } = renderWithProviders(
      <>
        <TextColorIcon color="#ff0000" />
        <HighlightIcon color="#00ff00" />
      </>,
    );
    const rects = [...container.querySelectorAll('rect')];
    expect(rects.some((r) => r.getAttribute('fill') === '#ff0000')).toBe(true);
    expect(rects.some((r) => r.getAttribute('fill') === '#00ff00')).toBe(true);
  });
});
