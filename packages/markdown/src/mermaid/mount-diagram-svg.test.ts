/**
 * mountDiagramSvg spec (MPO-195). MermaidBlock.test.tsx mocks this helper
 * out, so until now nothing exercised the sanitizer itself. What it owns:
 * inert parsing, executable-node removal, event-handler and javascript:
 * stripping, the HTML fallback for markup that is not well-formed XML, and a
 * false return that leaves the container alone.
 */

import { describe, expect, it } from 'vitest';

import { mountDiagramSvg } from './mount-diagram-svg';

const host = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

const paragraph = (text: string): HTMLParagraphElement => {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
};

const PLAIN = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>';

describe(mountDiagramSvg, () => {
  it('mounts a well-formed diagram as real SVG nodes and reports true', () => {
    const container = host();
    expect(mountDiagramSvg(container, PLAIN)).toBe(true);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('replaces previous content instead of appending to it', () => {
    const container = host();
    container.append(paragraph('stale'));
    mountDiagramSvg(container, PLAIN);
    expect(container.querySelector('p')).toBeNull();
    expect(container.childElementCount).toBe(1);
  });

  it('removes script, iframe, object and embed nodes', () => {
    const container = host();
    mountDiagramSvg(
      container,
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<script>globalThis.__pwned = true;</script>' +
        '<iframe src="https://example.com"></iframe>' +
        '<object data="x.swf"></object>' +
        '<embed src="x.swf" />' +
        '<rect width="10" height="10" />' +
        '</svg>',
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(container.querySelector('embed')).toBeNull();
    // the drawing that carried them survives
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('strips on* handlers from the root and from descendants', () => {
    const container = host();
    mountDiagramSvg(
      container,
      '<svg xmlns="http://www.w3.org/2000/svg" onload="globalThis.__pwned = true">' +
        '<rect width="10" height="10" onclick="globalThis.__pwned = true" ONMOUSEOVER="x()" />' +
        '</svg>',
    );
    const svg = container.querySelector('svg')!;
    expect(svg.hasAttribute('onload')).toBe(false);
    const rect = container.querySelector('rect')!;
    expect(rect.hasAttribute('onclick')).toBe(false);
    expect(rect.getAttributeNames().some((name) => name.toLowerCase() === 'onmouseover')).toBe(false);
  });

  it('strips javascript: hrefs but keeps ordinary ones', () => {
    const container = host();
    mountDiagramSvg(
      container,
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<a href="  JavaScript:alert(1)"><text>bad</text></a>' +
        '<a href="https://example.com"><text>good</text></a>' +
        '</svg>',
    );
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors).toHaveLength(2);
    expect(anchors[0].hasAttribute('href')).toBe(false);
    expect(anchors[1].getAttribute('href')).toBe('https://example.com');
    // the defanged anchor's content is still drawn
    expect(container.textContent).toContain('bad');
  });

  it('falls back to lenient HTML parsing for markup that is not well-formed XML', () => {
    const container = host();
    const mounted = mountDiagramSvg(
      container,
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>label</foreignObject></svg>',
    );
    expect(mounted).toBe(true);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.textContent).toContain('label');
  });

  it('returns false and leaves the container untouched when there is no svg', () => {
    const container = host();
    container.append(paragraph('kept'));
    expect(mountDiagramSvg(container, 'not markup at all')).toBe(false);
    expect(mountDiagramSvg(container, '')).toBe(false);
    expect(mountDiagramSvg(container, '<div>html but no svg</div>')).toBe(false);
    expect(container.querySelector('p')?.textContent).toBe('kept');
  });
});
