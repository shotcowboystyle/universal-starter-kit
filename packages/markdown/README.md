# @repo/markdown

Cross-platform markdown renderer for React and React Native with MDX component
support and [Shiki](https://shiki.style) syntax highlighting.

## Install

```bash
pnpm add @repo/markdown
```

Requires `react` and `react-native` (or react-native-web) as peers.

## What it owns

- **`<Markdown>`** — renders a markdown string with Tamagui typography
- **Parser / renderer** — `parseMarkdown`, `renderMarkdown`
- **Shiki highlighting** — `highlightCode` (re-exported from
  `@repo/ui`, the one canonical highlighter stack) and
  `CodeTheme`: `"auto"` paints the house syntax theme, whose inks are the
  theme's `$syntax*` tokens; `"github-dark"`, `"github-light"`, … eject to
  that literal palette
- **MDX building blocks** — `Aside`, `Notice`, `MdxCodeBlock`, `Tabs`, `Table`,
  `MarkdownSimpleTable`, `Li`, `Ul`, `Hr`, `Video`, and the `mdxComponents` map
  for MDX pipelines

## What it must not do

- No rich-text _editing_ — the editor lives in `@repo/rich-text`
- No app-specific content or Frappe assumptions

## Usage

```tsx
import { Markdown } from '@repo/markdown';

const source = `
# Hello

Some **markdown** with highlighted code:

\`\`\`ts
const x: number = 42;
\`\`\`
`;

export function Docs() {
  return <Markdown codeTheme="auto">{source}</Markdown>;
}
```

Override individual elements with the `components` prop
(`<Markdown components={{ h1: MyHeading }}>`).

## Styling

Typography and spacing resolve through the knobs system in
`@repo/theme` (see `docs/standards/frontend/knobs-system.md`
in the [universal-starter-kit repo](https://github.com/shotcowboystyle/universal-starter-kit/mpo)).

## License

Apache-2.0
