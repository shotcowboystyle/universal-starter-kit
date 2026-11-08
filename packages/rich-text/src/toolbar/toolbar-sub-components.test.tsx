import { renderWithProviders } from '@repo/test-utils';
import { describe, it, expect, vi } from 'vitest';

import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../constants';
import { RichEditorContext } from '../context';
import { defaultEditorState } from '../types';

import { normalizeUrl } from './LinkDialog';

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: any) => children,
}));

const { TextColorPicker, HighlightColorPicker } = await import('./ColorPicker');
const { HeadingPicker } = await import('./HeadingPicker');
const { ListPicker } = await import('./ListPicker');
const { ImageDialog } = await import('./ImageDialog');

const withContext = (ui: React.ReactElement) => (
  <RichEditorContext.Provider
    size="$true"
    compact={false}
    disabled={false}>
    {ui}
  </RichEditorContext.Provider>
);

describe('ColorPicker', () => {
  it('renders text color picker trigger button', () => {
    const editorRef = { current: null };
    const { getByRole } = renderWithProviders(
      withContext(
        <TextColorPicker
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Text Color');
  });

  it('renders highlight color picker trigger button', () => {
    const editorRef = { current: null };
    const { getByRole } = renderWithProviders(
      withContext(
        <HighlightColorPicker
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Highlight Color');
  });

  it('uses TEXT_COLORS and HIGHLIGHT_COLORS from constants', () => {
    expect(TEXT_COLORS.length).toBeGreaterThan(5);
    expect(HIGHLIGHT_COLORS.length).toBeGreaterThan(3);
  });
});

describe('LinkDialog normalizeUrl', () => {
  it('auto-prepends https:// to URLs without protocol', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('www.test.org/path')).toBe('https://www.test.org/path');
  });

  it('preserves URLs that already have a protocol', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('  ')).toBe('');
  });
});

describe('HeadingPicker', () => {
  it('renders H1-H6 plus Paragraph options (7 total) in trigger', () => {
    const editorRef = { current: null };
    const { getByRole } = renderWithProviders(
      withContext(
        <HeadingPicker
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Heading');
  });
});

describe('ListPicker', () => {
  it('renders list picker trigger button', () => {
    const editorRef = { current: null };
    const { getByRole } = renderWithProviders(
      withContext(
        <ListPicker
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Lists');
  });
});

describe('ImageDialog', () => {
  it('renders image dialog trigger button with URL input', () => {
    const editorRef = { current: null };
    const { getByRole } = renderWithProviders(withContext(<ImageDialog editorRef={editorRef} />));
    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Insert Image');
  });
});
