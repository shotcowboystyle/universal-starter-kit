# @repo/rich-text

Cross-platform rich text editor — [Tiptap](https://tiptap.dev) on web,
[10Tap](https://github.com/10play/10tap-editor) on native — with markdown
support and a shared command/state API.

## Install

```bash
pnpm add @repo/rich-text
```

Requires `react` and `react-native` (or react-native-web) as peers.

## What it owns

- **`RichEditor`** — the headless-ish editor surface (HTML/JSON content in,
  HTML + JSON out), one API across web and native
- **`RichTextEditor`** — the composed editor with toolbar chrome
- Types: `RichEditorRef` (imperative commands), `RichEditorProps`,
  `EditorCommand`, `EditorState`

## What it must not do

- No markdown _rendering_ — read-only markdown display lives in
  `@repo/markdown`
- No form-field contract of its own — form integration wraps it from
  `@repo/forms` conventions

## Usage

```tsx
import { RichEditor } from '@repo/rich-text';

export function NoteEditor() {
  return (
    <RichEditor
      initialContent="<p>Hello <strong>world</strong></p>"
      placeholder="Write something…"
      autoFocus
      onChange={(html, json) => {
        console.log('content changed', html, json);
      }}
    />
  );
}
```

Pass `editable={false}` for a read-only view; use `onStateChange` to drive a
custom toolbar (bold/italic/list active states).

## Styling

Editor chrome resolves through the knobs system in `@repo/theme`
(see `docs/standards/frontend/knobs-system.md` in the
[universal-starter-kit repo](https://github.com/shotcowboystyle/universal-starter-kit/mpo)).

## License

Apache-2.0
