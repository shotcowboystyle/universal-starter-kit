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

import { CodeBlock } from '../components/CodeBlock';
import { markdownCodeColors } from '../shared/color-ramps';

import { mountDiagramSvg } from './mount-diagram-svg';
import { renderMermaidDiagram } from './render-mermaid-diagram';

export interface MermaidBlockProps {
  /** Mermaid diagram source */
  children: string;
}

type MermaidState = { status: 'loading' } | { status: 'ok'; svg: string } | { status: 'error'; error: string };

/** A settled render, tagged with the inputs it was rendered from. */
interface SettledRender {
  code: string;
  scheme: 'light' | 'dark';
  state: MermaidState;
}

const LOADING: MermaidState = { status: 'loading' };

export const MermaidBlock = ({ children }: MermaidBlockProps) => {
  const { knobProps } = useResolvedKnobs();
  const themeName = useThemeName();
  const scheme = themeName.startsWith('dark') ? 'dark' : 'light';
  const [settled, setSettled] = useState<SettledRender | null>(null);
  // A render settled for other inputs is stale: show loading until the
  // current source/scheme settles.
  const state = settled?.code === children && settled.scheme === scheme ? settled.state : LOADING;
  const svgHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      // renderMermaidDiagram never rejects: failures come back as { ok: false }
      const result = await renderMermaidDiagram(children, { scheme });
      if (cancelled) {
        return;
      }
      setSettled({
        code: children,
        scheme,
        state: result.ok ? { status: 'ok', svg: result.svg } : { status: 'error', error: result.error },
      });
    };
    void render();
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
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG host, not an <img> source; the role names the diagram for assistive tech
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
};
