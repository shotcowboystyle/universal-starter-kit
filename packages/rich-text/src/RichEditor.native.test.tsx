import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { fontCategoryStacks } from '@repo/theme';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- the module namespace object is what gets substituted for `require('react')`
import * as React from 'react';
import type { ReactNode } from 'react';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- the module namespace object is what gets substituted for `require('react/jsx-runtime')`
import * as jsxRuntime from 'react/jsx-runtime';
import { JsxEmit, ModuleKind, transpileModule } from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RichEditor as NativeRichEditor } from './RichEditor.native';

let bodyFamily: string | null = 'Inter';
let headingFamily: string | null = 'Inter';
let bodyToken = '$body';
let headingToken = '$heading';
const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const Pressable = ({
  children,
  onPress,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) => (
  <button
    type="button"
    aria-label={accessibilityLabel}
    onClick={onPress}>
    {children}
  </button>
);
const Tentap = (props: { bodyFontFamily?: string; headingFontFamily?: string }) => (
  <div
    data-testid="tentap"
    data-body={props.bodyFontFamily}
    data-heading={props.headingFontFamily}
  />
);

// RichEditor deliberately uses a guarded native require for its optional
// WebView backend. Execute the real wrapper with that boundary substituted;
// importing through the web bundler would turn it into the unavailable branch.
interface NativeExports {
  RichEditor?: typeof NativeRichEditor;
}
const nativeExports: NativeExports = {};
const modules = new Map<string, object>([
  ['react', React],
  ['react/jsx-runtime', jsxRuntime],
  [
    'react-native',
    {
      KeyboardAvoidingView: Container,
      SafeAreaView: Container,
      Pressable,
      Modal: ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
        visible ? <div>{children}</div> : null,
      Platform: { OS: 'ios' },
      StyleSheet: { create: <T,>(styles: T) => styles },
    },
  ],
  [
    'tamagui',
    {
      Text: Container,
      View: Container,
      XStack: Container,
      YStack: Container,
      getConfig: () => ({
        fonts: {
          [bodyToken.slice(1)]: { family: bodyFamily },
          [headingToken.slice(1)]: { family: headingFamily },
        },
      }),
      withStaticProperties: Object.assign,
    },
  ],
  [
    '@repo/theme',
    {
      fontCategoryStacks,
      useGlyphColor: () => 'black',
      sizeRecipeForToken: () => ({ iconSize: 18 }),
      useResolvedKnobs: () => ({
        knobProps: {
          body: { fontFamily: bodyToken },
          heading: { fontFamily: headingToken },
          borderRadius: {},
          panelPadding: { padding: 12 },
        },
      }),
    },
  ],
  ['@repo/ui', { Pencil: () => null }],
  ['@repo/forms', { Button: Pressable, clampRadiusForLargeComponent: () => 4 }],
  ['./types', { defaultEditorState: {} }],
  ['./context', { RichEditorContext: { Provider: Container } }],
  ['./styled', { EditorFrame: Container }],
  ['./toolbar/FixedToolbar', { FixedToolbar: () => null }],
  ['./preview', { parseHtmlPreview: () => ({ blocks: [], truncated: false }) }],
  ['./editor/markdown', { htmlToMarkdown: (v: string) => v, markdownToHtml: (v: string) => v }],
  ['./shared/t', { t: (v: string) => v }],
  ['./editor/TentapEditor.native', { TentapEditor: Tentap }],
]);
// oxlint-disable-next-line sonarjs/code-eval -- runs this package's own transpiled source with substituted imports
runInNewContext(
  transpileModule(readFileSync(path.join(import.meta.dirname, 'RichEditor.native.tsx'), 'utf-8'), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText,
  {
    exports: nativeExports,
    require: (name: string) => {
      const mod = modules.get(name);
      if (mod === undefined) {
        throw new Error(`Unexpected native wrapper import ${name}`);
      }
      return mod;
    },
  },
);
const { RichEditor } = nativeExports;
if (RichEditor === undefined) {
  throw new Error('RichEditor.native.tsx did not export RichEditor');
}

describe('native RichEditor', () => {
  beforeEach(() => {
    bodyFamily = 'Inter';
    headingFamily = 'Inter';
    bodyToken = '$body';
    headingToken = '$heading';
  });
  afterEach(cleanup);

  describe('native RichEditor font propagation', () => {
    it.each([false, true])('passes resolved families to the editing document, inline=%s', (inlineEditing) => {
      render(
        <RichEditor
          inlineEditing={inlineEditing}
          initialContent="<p>Saved note</p>"
        />,
      );
      if (!inlineEditing) {
        fireEvent.click(screen.getByRole('button', { name: 'Edit rich text' }));
      }
      const editor = screen.getByTestId('tentap');
      expect(editor.dataset.body).toBe(`${bodyFamily}, ${fontCategoryStacks['sans-serif']}`);
      expect(editor.dataset.heading).toBe(`${headingFamily}, ${fontCategoryStacks['sans-serif']}`);
    });
  });

  describe('native editor CSS font fallbacks', () => {
    it('keeps configured families first and uses the selected category fallback', () => {
      bodyFamily = 'Custom Serif';
      headingFamily = 'Custom Mono';
      bodyToken = '$serif';
      headingToken = '$mono';
      render(
        <RichEditor
          defaultFullscreen
          initialContent="<p>Saved note</p>"
        />,
      );
      const editor = screen.getByTestId('tentap');
      expect(editor.dataset.body).toBe(`${bodyFamily}, ${fontCategoryStacks.serif}`);
      expect(editor.dataset.heading).toBe(`${headingFamily}, ${fontCategoryStacks.mono}`);
    });

    it('preserves explicit CSS stacks and intentional generic families', () => {
      bodyFamily = 'Georgia, serif';
      headingFamily = 'system-ui';
      render(<RichEditor defaultFullscreen />);
      const editor = screen.getByTestId('tentap');
      expect(editor.dataset.body).toBe(bodyFamily);
      expect(editor.dataset.heading).toBe(headingFamily);
    });

    it('uses the canonical fallback when no configured font exists', () => {
      bodyFamily = null;
      headingFamily = null;
      headingToken = '$mono';
      render(<RichEditor defaultFullscreen />);
      const editor = screen.getByTestId('tentap');
      expect(editor.dataset.body).toBe(fontCategoryStacks['sans-serif']);
      expect(editor.dataset.heading).toBe(fontCategoryStacks.mono);
    });
  });
});
