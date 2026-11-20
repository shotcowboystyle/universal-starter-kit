import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TentapEditor } from './TentapEditor.native';

const state = vi.hoisted(() => ({
  props: {} as any,
  scheme: 'light',
  os: 'light',
  theme: { color12: { val: 'black' } },
  themes: {} as Record<string, Record<string, { val: string }>>,
  editor: {
    injectCSS: vi.fn<(css: string, tag: string) => void>(),
    setContent: vi.fn<(content: string) => void>(),
    _subscribeToEditorStateUpdate: vi.fn<() => () => void>(() => vi.fn<() => void>()),
    getEditorState: vi.fn<() => object>(() => ({})),
  },
}));

vi.mock<object>(import('react-native'), () => ({
  StyleSheet: { create: (styles: any) => styles },
  useColorScheme: () => state.os,
}));
vi.mock<object>(import('tamagui'), () => ({
  View: ({ children }: any) => <div>{children}</div>,
  useTheme: () => state.theme,
  useThemeName: () => state.scheme,
  getConfig: () => ({ themes: state.themes }),
  getVariableValue: (value: any) => value?.val ?? value,
}));
vi.mock<object>(import('../context'), () => ({
  RichEditorContext: { useStyledContext: () => ({ disabled: false }) },
}));
vi.mock(import('../shared/t'), () => ({ t: (value: string) => value }));
vi.mock<object>(import('@10play/tentap-editor'), () => ({
  RichText: (props: any) => {
    state.props = props;
    return <div data-testid="native-webview" />;
  },
  useEditorBridge: () => state.editor,
  TenTapStartKit: [],
  UnderlineBridge: {},
  LinkBridge: {},
  ColorBridge: {},
  HighlightBridge: {},
  ImageBridge: {},
  TaskListBridge: {},
  PlaceholderBridge: { configureExtension: () => ({}) },
  darkEditorCss: 'body { background: black; color: white; }',
  darkEditorTheme: {},
}));

describe('Tentap native stylesheet lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.scheme = 'light';
    state.os = 'light';
    state.theme = { color12: { val: 'black' } };
    state.themes = {};
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('waits for load, reapplies after the iOS replacement document, and updates live styling', () => {
    const view = render(
      <TentapEditor
        initialContent="<p>Saved note</p>"
        bodyFontFamily="system-ui"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(state.editor.injectCSS).not.toHaveBeenCalled();

    // Installed RichText calls its supplied props.onLoad after its own loaded
    // state and first-iOS-load key change. That replacement fires onLoad again.
    const originalLoad = state.props.onLoad;
    act(() => {
      originalLoad({ nativeEvent: { url: 'about:blank' } });
    });
    expect(state.editor.injectCSS).toHaveBeenCalledTimes(3);
    act(() => {
      state.props.onLoad({ nativeEvent: { url: 'about:blank' } });
    });
    expect(state.editor.injectCSS).toHaveBeenCalledTimes(6);
    expect(state.editor.injectCSS).toHaveBeenLastCalledWith(
      expect.stringContaining('font-family: system-ui'),
      'multiplatform-tentap-content',
    );

    state.scheme = 'dark';
    state.theme = { color12: { val: 'white' } };
    view.rerender(
      <TentapEditor
        initialContent="<p>Saved note</p>"
        bodyFontFamily="Georgia, serif"
      />,
    );
    expect(state.editor.injectCSS).toHaveBeenCalledWith(
      expect.stringContaining('background: black'),
      'multiplatform-tentap-dark',
    );
    expect(state.editor.injectCSS).toHaveBeenCalledWith(
      expect.stringContaining('--color12: white'),
      'multiplatform-tentap-palette',
    );
    expect(state.editor.injectCSS).toHaveBeenLastCalledWith(
      expect.stringContaining('font-family: Georgia, serif'),
      'multiplatform-tentap-content',
    );
    expect(state.editor.setContent).not.toHaveBeenCalled();
    const calls = state.editor.injectCSS.mock.calls.length;
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(state.editor.injectCSS).toHaveBeenCalledTimes(calls);
  });

  it('uses the latest scheme when styling changes before the WebView loads', () => {
    const view = render(<TentapEditor />);
    state.scheme = 'dark';
    state.theme = { color12: { val: 'white' } };
    view.rerender(<TentapEditor />);
    expect(state.editor.injectCSS).not.toHaveBeenCalled();
    act(() => {
      state.props.onLoad({ nativeEvent: { url: 'about:blank' } });
    });
    expect(state.editor.injectCSS).toHaveBeenCalledTimes(3);
    expect(state.editor.injectCSS).toHaveBeenCalledWith(
      expect.stringContaining('--color12: white'),
      'multiplatform-tentap-palette',
    );
  });

  it('hands a theme that follows the appearance both palettes, so an unheard flip still repaints', () => {
    state.scheme = 'light_blue';
    state.themes = { dark_blue: { color12: { val: 'white' } } };
    render(<TentapEditor />);
    act(() => {
      state.props.onLoad({ nativeEvent: { url: 'about:blank' } });
    });
    const css = (tag: string) => state.editor.injectCSS.mock.calls.findLast((call) => call[1] === tag)?.[0];
    expect(css('multiplatform-tentap-palette')).toBe(
      '@media (prefers-color-scheme: light) { :root { --color12: black; } } ' +
        '@media (prefers-color-scheme: dark) { :root { --color12: white; } }',
    );
    expect(css('multiplatform-tentap-dark')).toBe(
      '@media (prefers-color-scheme: dark) { body { background: black; color: white; } }',
    );
  });

  it('keeps a scheme forced away from the appearance static', () => {
    state.scheme = 'dark_blue';
    state.theme = { color12: { val: 'white' } };
    state.themes = { light_blue: { color12: { val: 'black' } } };
    render(<TentapEditor />);
    act(() => {
      state.props.onLoad({ nativeEvent: { url: 'about:blank' } });
    });
    expect(state.editor.injectCSS).toHaveBeenCalledWith(':root { --color12: white; }', 'multiplatform-tentap-palette');
    expect(state.editor.injectCSS).toHaveBeenCalledWith(
      'body { background: black; color: white; }',
      'multiplatform-tentap-dark',
    );
  });
});
