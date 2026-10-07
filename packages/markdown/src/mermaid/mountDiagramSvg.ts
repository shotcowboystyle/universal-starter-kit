/**
 * Mounts a mermaid SVG string into a container as real DOM nodes.
 *
 * mermaid already sanitizes its output at securityLevel "strict" (it runs
 * DOMPurify internally); this helper adds defense in depth: the markup is
 * parsed inert (scripts never execute during HTML parsing), executable
 * elements and on* handlers are stripped, and only the <svg> element is
 * imported into the live document.
 */

const EXECUTABLE_SELECTOR = 'script, iframe, object, embed';

/**
 * XML parse first (faithful SVG namespaces for importNode), lenient HTML
 * parse as fallback for markup that is not well-formed XML (e.g. html
 * labels inside foreignObject).
 */
function parseSvgElement(svg: string): Element | null {
  try {
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = xml.documentElement;
    if (root?.tagName.toLowerCase() === 'svg' && !xml.querySelector('parsererror')) {
      return root;
    }
  } catch {
    // fall through to HTML parsing
  }
  const html = new DOMParser().parseFromString(svg, 'text/html');
  return html.body.querySelector('svg');
}

export function mountDiagramSvg(container: HTMLElement, svg: string): boolean {
  const root = parseSvgElement(svg);
  if (!root) {
    return false;
  }
  for (const el of [...root.querySelectorAll(EXECUTABLE_SELECTOR)]) {
    el.remove();
  }
  for (const el of [root, ...[...root.querySelectorAll('*')]]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  container.replaceChildren(document.importNode(root, true));
  return true;
}
