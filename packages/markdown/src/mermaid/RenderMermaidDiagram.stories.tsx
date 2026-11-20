/**
 * renderMermaidDiagram — the canonical lazy mermaid engine (LC-16), driven
 * directly rather than through MermaidBlock.
 *
 * MermaidBlock hides the whole contract behind one component, so nothing
 * showed what the helper actually returns. It is exported from the
 * dependency-free `@repo/markdown/mermaid` subpath precisely so
 * other surfaces can call it themselves — the rich-text editor's live
 * code-block preview does. These stories render the result of that call: the
 * `{ ok, svg }` / `{ ok, error }` union, the scheme-driven re-initialize, and
 * the fontFamily option, with the SVG mounted through mountDiagramSvg so the
 * engine's real output is on screen.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useRef, useState } from 'react';
import { Paragraph, View, XStack, YStack } from 'tamagui';

import { mountDiagramSvg } from './mount-diagram-svg';
import { renderMermaidDiagram } from './render-mermaid-diagram';
import type { MermaidRenderResult } from './render-mermaid-diagram';

const meta: Meta = {
  title: 'Markdown/Mermaid Engine',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "renderMermaidDiagram(code, { scheme, fontFamily }) dynamically imports the mermaid engine on first call, parses before rendering so a syntax error never leaves mermaid's error-bomb SVG behind, and resolves to { ok: true, svg } or { ok: false, error }. The engine is global, so it re-initializes only when scheme or fontFamily changes.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const FLOWCHART = `graph TD
  A[Fence] --> B[renderMermaidDiagram]
  B --> C[mountDiagramSvg]
  C --> D[Painted]`;

const INVALID = 'graph TD\n A--';

interface EngineSpecimenProps {
  label: string;
  code: string;
  scheme?: 'light' | 'dark';
  fontFamily?: string;
}

const describeResult = (result: MermaidRenderResult | null): string => {
  if (result === null) {
    return 'awaiting the lazy engine…';
  }
  return result.ok ? `ok: true · ${result.svg.length} chars of svg` : `ok: false · ${result.error}`;
};

/** Calls the engine once and shows the union it resolved to. */
const EngineSpecimen = ({ label, code, scheme, fontFamily }: EngineSpecimenProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputKey = `${code}|${scheme ?? ''}|${fontFamily ?? ''}`;
  const [settled, setSettled] = useState<{ key: string; result: MermaidRenderResult } | null>(null);
  // A result settled for other inputs is stale: show "awaiting" until the current call resolves.
  const result = settled?.key === inputKey ? settled.result : null;

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      // renderMermaidDiagram never rejects: failures come back as { ok: false }
      const next = await renderMermaidDiagram(code, { scheme, fontFamily });
      if (cancelled) {
        return;
      }
      setSettled({ key: `${code}|${scheme ?? ''}|${fontFamily ?? ''}`, result: next });
      if (next.ok && hostRef.current) {
        mountDiagramSvg(hostRef.current, next.svg);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [code, scheme, fontFamily]);

  return (
    <YStack
      gap="$2"
      flex={1}>
      <Paragraph fontWeight="600">{label}</Paragraph>
      <View
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$4"
        padding="$3"
        backgroundColor="$color2"
        minHeight={80}>
        <div ref={hostRef} />
      </View>
      <Paragraph
        size="$1"
        color={result && !result.ok ? '$red11' : '$color10'}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a Tamagui Paragraph; the live-region role announces the async engine result
        role="status">
        {describeResult(result)}
      </Paragraph>
    </YStack>
  );
};

export const Main: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <EngineSpecimen
        label="A flowchart through the engine"
        code={FLOWCHART}
      />
    </YStack>
  ),
};

/**
 * Mermaid's config is global, so the helper re-initializes when the scheme
 * changes. Both specimens render from the same source; only the theme differs.
 */
export const SchemeSwitch: Story = {
  render: () => (
    <XStack
      gap="$4"
      padding="$4"
      maxWidth={900}>
      <EngineSpecimen
        label="scheme: light"
        code={FLOWCHART}
        scheme="light"
      />
      <EngineSpecimen
        label="scheme: dark"
        code={FLOWCHART}
        scheme="dark"
      />
    </XStack>
  ),
};

/**
 * Axiom 6: parse() runs before render(), so invalid source resolves to
 * { ok: false, error } carrying mermaid's own message, and nothing is
 * mounted. The box stays empty on purpose — the caller shows the error.
 */
export const InvalidSource: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <EngineSpecimen
        label="Invalid source returns the parse message"
        code={INVALID}
      />
    </YStack>
  ),
};

/** fontFamily is forwarded into mermaid's theme config, and re-inits like scheme. */
export const FontFamily: Story = {
  render: () => (
    <XStack
      gap="$4"
      padding="$4"
      maxWidth={900}>
      <EngineSpecimen
        label="engine default font"
        code={FLOWCHART}
      />
      <EngineSpecimen
        label='fontFamily: "Courier New, monospace"'
        code={FLOWCHART}
        fontFamily="Courier New, monospace"
      />
    </XStack>
  ),
};

/** Other grammars go through the same call; only the source changes. */
export const OtherGrammars: Story = {
  render: () => (
    <YStack
      gap="$5"
      padding="$4"
      maxWidth={700}>
      <EngineSpecimen
        label="sequenceDiagram"
        code={'sequenceDiagram\n  Client->>Engine: render\n  Engine-->>Client: svg'}
      />
      <EngineSpecimen
        label="pie"
        code={'pie title Coverage\n  "Storied" : 27\n  "Unstoried" : 24'}
      />
    </YStack>
  ),
};
