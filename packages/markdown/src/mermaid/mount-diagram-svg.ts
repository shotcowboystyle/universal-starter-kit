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
// oxlint-disable-next-line eslint/no-script-url -- the scheme this sanitizer detects and strips; nothing navigates to it
const JAVASCRIPT_PROTOCOL = 'javascript:';

/**
 * XML parse first (faithful SVG namespaces for importNode), lenient HTML
 * parse as fallback for markup that is not well-formed XML (e.g. html
 * labels inside foreignObject).
 */
const parseSvgElement = (svg: string): Element | null => {
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
};

export const mountDiagramSvg = (container: HTMLElement, svg: string): boolean => {
  const root = parseSvgElement(svg);
  if (!root) {
    return false;
  }
  for (const el of root.querySelectorAll(EXECUTABLE_SELECTOR)) {
    el.remove();
  }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    // getAttributeNames() is a snapshot, so removing while iterating is safe
    for (const attrName of el.getAttributeNames()) {
      const name = attrName.toLowerCase();
      const value = el.getAttribute(attrName) ?? '';
      if (name.startsWith('on') || (name === 'href' && value.trim().toLowerCase().startsWith(JAVASCRIPT_PROTOCOL))) {
        el.removeAttribute(attrName);
      }
    }
  }
  container.replaceChildren(document.importNode(root, true));
  return true;
};
