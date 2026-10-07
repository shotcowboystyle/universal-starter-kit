/**
 * Read-only mermaid diagram block for rendered markdown (web).
 *
 * Fenced ```mermaid code renders as a live SVG diagram (GitLab behavior).
 * The engine is lazy-loaded on first render via the canonical
 * `renderMermaidDiagram` helper; while loading the raw source shows as a
 * plain code block, and invalid source shows the parse error above the
 * source (Axiom 6: show the error, never blank).
 */

import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';
import { Text, View, useThemeName } from 'tamagui';

import { CodeBlock } from '../components';
import { markdownCodeColors } from '../shared/colorRamps';

import { mountDiagramSvg } from './mountDiagramSvg';
import { renderMermaidDiagram } from './renderMermaidDiagram';

export interface MermaidBlockProps {
  /** Mermaid diagram source */
  children: string;
}

type MermaidState = { status: 'loading' } | { status: 'ok'; svg: string } | { status: 'error'; error: string };

export function MermaidBlock({ children }: MermaidBlockProps) {
  const { knobProps } = useResolvedKnobs();
  const themeName = useThemeName();
  const scheme = String(themeName).startsWith('dark') ? 'dark' : 'light';
  const [state, setState] = useState<MermaidState>({ status: 'loading' });
  const svgHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    renderMermaidDiagram(children, { scheme }).then((result) => {
      if (cancelled) {
        return;
      }
      setState(result.ok ? { status: 'ok', svg: result.svg } : { status: 'error', error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [children, scheme]);

  useEffect(() => {
    if (state.status !== 'ok' || !svgHostRef.current) {
      return;
    }
    mountDiagramSvg(svgHostRef.current, state.svg);
  }, [state]);

  if (state.status === 'ok') {
    return (
      <View
        {...(knobProps.borderRadiusNested ?? { borderRadius: '$4' })}
        backgroundColor={markdownCodeColors.background.base}
        borderWidth={1}
        borderColor={markdownCodeColors.border.base}
        paddingHorizontal={16}
        paddingVertical={12}
        marginVertical="$2"
        overflow="hidden">
        <div
          ref={svgHostRef}
          role="img"
          aria-label="Mermaid diagram"
          data-mermaid-diagram="true"
          style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}
        />
      </View>
    );
  }

  return (
    <View paddingTop={state.status === 'error' ? '$2' : undefined}>
      {state.status === 'error' ? (
        <Text
          color="$red11"
          fontSize={13}
          role="alert">
          {`Mermaid: ${state.error}`}
        </Text>
      ) : null}
      <CodeBlock lang="mermaid">{children}</CodeBlock>
    </View>
  );
}
