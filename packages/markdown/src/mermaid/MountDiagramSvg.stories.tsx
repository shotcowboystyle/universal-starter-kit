/**
 * mountDiagramSvg — the sanitizing mount step between the mermaid engine and
 * the page. MermaidBlock hands it an SVG string; it parses that string INERT
 * (a detached document, so nothing executes during parsing), strips
 * executable elements and event handlers, and imports only the <svg> into the
 * live document.
 *
 * The helper is exported from the `@repo/markdown/mermaid`
 * subpath, so callers that render diagrams themselves reach it directly.
 * These stories mount real strings into real containers, including a hostile
 * one, and show what survived.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useRef, useState } from 'react';
import { Paragraph, View, YStack } from 'tamagui';

import { mountDiagramSvg } from './mountDiagramSvg';

const meta: Meta = {
  title: 'Markdown/Mermaid Mount',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'mountDiagramSvg(container, svg) parses an SVG string inert, drops script/iframe/object/embed nodes, on* handlers and javascript: hrefs, then imports the <svg> into the container. Returns false and leaves the container untouched when the string holds no <svg> at all.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/** Mounts `svg` on mount and reports what mountDiagramSvg returned. */
function MountSpecimen({ label, svg }: { label: string; svg: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ mounted: boolean; html: string } | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const mounted = mountDiagramSvg(hostRef.current, svg);
    setResult({ mounted, html: hostRef.current.innerHTML });
  }, [svg]);

  return (
    <YStack gap="$2">
      <Paragraph fontWeight="600">{label}</Paragraph>
      <View
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$4"
        padding="$3"
        backgroundColor="$color2">
        <div
          ref={hostRef}
          data-mount-host="true"
        />
      </View>
      <Paragraph
        size="$1"
        color="$color10">
        {result ? `returned ${result.mounted}` : 'mounting…'}
      </Paragraph>
      <Paragraph
        size="$1"
        color="$color10"
        fontFamily="$mono">
        {result ? result.html || '(container left empty)' : ''}
      </Paragraph>
    </YStack>
  );
}

const plainDiagram = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90">
  <rect x="4" y="4" width="92" height="42" rx="6" fill="none" stroke="#7c8ea0" stroke-width="2"/>
  <text x="50" y="30" text-anchor="middle" fill="#7c8ea0" font-size="14">Parse</text>
  <rect x="124" y="44" width="92" height="42" rx="6" fill="none" stroke="#7c8ea0" stroke-width="2"/>
  <text x="170" y="70" text-anchor="middle" fill="#7c8ea0" font-size="14">Render</text>
  <path d="M96 25 L170 25 L170 44" fill="none" stroke="#7c8ea0" stroke-width="2"/>
</svg>`;

const hostileDiagram = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="60" viewBox="0 0 220 60">
  <script>window.__mermaidPwned = true;</script>
  <rect x="4" y="4" width="212" height="52" rx="6" fill="none" stroke="#7c8ea0" stroke-width="2" onload="window.__mermaidPwned = true"/>
  <a href="javascript:alert(1)"><text x="110" y="34" text-anchor="middle" fill="#7c8ea0" font-size="14">survives, defanged</text></a>
  <iframe src="https://example.com"></iframe>
</svg>`;

const foreignObjectDiagram = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="60">
  <foreignObject x="0" y="0" width="220" height="60">
    <div>an html label, not well-formed XML
  </foreignObject>
</svg>`;

export const Main: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MountSpecimen
        label="A well-formed diagram mounts as real SVG nodes"
        svg={plainDiagram}
      />
    </YStack>
  ),
};

/**
 * Defense in depth on top of mermaid's own DOMPurify pass: the script, the
 * iframe, the `onload` and the `javascript:` href are all gone, and the
 * drawing that carried them still paints.
 */
export const HostileMarkupIsStripped: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MountSpecimen
        label="script / iframe / onload / javascript: href removed, drawing kept"
        svg={hostileDiagram}
      />
    </YStack>
  ),
};

/**
 * XML parse first, lenient HTML parse as the fallback — mermaid emits html
 * labels inside foreignObject that are not well-formed XML.
 */
export const MalformedFallsBackToHtmlParsing: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MountSpecimen
        label="Unclosed html label inside foreignObject"
        svg={foreignObjectDiagram}
      />
    </YStack>
  ),
};

/** No <svg> anywhere: returns false, container untouched. */
export const NoSvgReturnsFalse: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4"
      gap="$5">
      <MountSpecimen
        label="Plain text"
        svg="not markup at all"
      />
      <MountSpecimen
        label="Empty string"
        svg=""
      />
    </YStack>
  ),
};
