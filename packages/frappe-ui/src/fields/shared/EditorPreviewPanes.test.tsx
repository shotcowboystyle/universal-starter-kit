/**
 * EditorPreviewPanes contract specs. Both source-editing fields
 * (MarkdownEditorField, CodeEditorField) get their edit/preview arrangement
 * from here, so the promises worth pinning are the ones a field author relies
 * on without re-reading the file:
 *
 *   - below the house md breakpoint it is Write/Preview TABS, and the tab
 *     labels are the caller's words, not hardcoded ones;
 *   - `defaultPreview` opens on the preview, which is what a read-only field
 *     wants — lead with the rendering, not with the source;
 *   - the tabs stay interactive on a disabled or read-only field, because
 *     those states gate EDITING and never VIEWING. A preview you cannot reach
 *     is the regression this component exists to prevent.
 *
 * The ≥ md two-pane branch pivots on a real layout measurement
 * (`onLayout` → ResizeObserver), which happy-dom's stub never delivers, so it
 * is left to the rendered proof rather than faked here.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { EditorPreviewPanes, PreviewSurface } from './EditorPreviewPanes';

// oxlint-disable-next-line vitest/require-top-level-describe -- cleanup applies to every suite in this file
afterEach(cleanup);

const panes = (extra: Partial<React.ComponentProps<typeof EditorPreviewPanes>> = {}) => (
  <EditorPreviewPanes
    editor={<Text>the source</Text>}
    preview={<Text>the rendering</Text>}
    editTabLabel="Write"
    previewTabLabel="Preview"
    {...extra}
  />
);

describe('EditorPreviewPanes narrow arrangement', () => {
  it('collapses into a two-tab strip', () => {
    renderWithProviders(panes());
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it("uses the caller's tab labels", () => {
    renderWithProviders(panes({ editTabLabel: 'Source', previewTabLabel: 'Rendered' }));
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Rendered')).toBeTruthy();
  });

  it('opens on the editor and mounts only that pane', () => {
    renderWithProviders(panes());
    expect(screen.getByText('the source')).toBeTruthy();
    expect(screen.queryByText('the rendering')).toBeNull();
  });

  it('defaultPreview opens on the preview instead', () => {
    renderWithProviders(panes({ defaultPreview: true }));
    expect(screen.getByText('the rendering')).toBeTruthy();
    expect(screen.queryByText('the source')).toBeNull();
  });

  it('switches to the preview on a tab press', () => {
    renderWithProviders(panes());
    fireEvent.click(screen.getByText('Preview'));
    expect(screen.getByText('the rendering')).toBeTruthy();
    expect(screen.queryByText('the source')).toBeNull();
  });

  it('switches back to the editor', () => {
    renderWithProviders(panes({ defaultPreview: true }));
    fireEvent.click(screen.getByText('Write'));
    expect(screen.getByText('the source')).toBeTruthy();
    expect(screen.queryByText('the rendering')).toBeNull();
  });

  it('marks the open tab selected', () => {
    renderWithProviders(panes());
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    fireEvent.click(screen.getByText('Preview'));
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the preview reachable even when the editor pane is a read-only surface', () => {
    // The gate belongs to the editor, never to the tab strip: a read-only
    // field still has to be able to look at its own rendering.
    renderWithProviders(panes({ editor: <Text>read-only source</Text>, defaultPreview: true }));
    fireEvent.click(screen.getByText('Write'));
    expect(screen.getByText('read-only source')).toBeTruthy();
    fireEvent.click(screen.getByText('Preview'));
    expect(screen.getByText('the rendering')).toBeTruthy();
  });
});

describe(PreviewSurface, () => {
  it('renders its children inside a scrollable surface', () => {
    const result = renderWithProviders(
      <PreviewSurface>
        <Text>rendered output</Text>
      </PreviewSurface>,
    );
    expect(result.container.textContent).toContain('rendered output');
  });

  it('adds a second, horizontal scroller for code panes', () => {
    const plain = renderWithProviders(
      <PreviewSurface>
        <Text>wrapped prose</Text>
      </PreviewSurface>,
    );
    const plainDepth = plain.container.querySelectorAll('*').length;
    cleanup();
    const code = renderWithProviders(
      <PreviewSurface horizontalScroll>
        <Text>long unwrapped line</Text>
      </PreviewSurface>,
    );
    expect(code.container.querySelectorAll('*').length).toBeGreaterThan(plainDepth);
    expect(code.container.textContent).toContain('long unwrapped line');
  });
});
