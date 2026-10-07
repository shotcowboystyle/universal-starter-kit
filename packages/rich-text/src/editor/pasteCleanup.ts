/**
 * Paste sanitizer for HTML clipboard payloads from Google Docs and
 * Microsoft Word/Outlook.
 *
 * Both sources wrap content in junk that either breaks ProseMirror parsing
 * or smuggles presentation into the document:
 * - Google Docs wraps the entire fragment in
 *   `<b style="font-weight:normal" id="docs-internal-guid-...">` (which
 *   ProseMirror would read as bold) and inlines font/size styles on spans.
 * - Word ships `<o:p>` tags, `Mso*` classes, `mso-*` style declarations,
 *   XML islands, and conditional comments.
 *
 * The cleanup keeps semantics (b/strong/i/em/u/lists/headings/links and
 * color/background-color styles the editor actually supports) and drops
 * the rest. Non-office HTML passes through untouched.
 */

const OFFICE_SIGNATURES = [
  'docs-internal-guid',
  'urn:schemas-microsoft-com',
  'MsoNormal',
  'mso-',
  '<o:p>',
  'office:office',
];

/** True when the clipboard HTML comes from Google Docs or Microsoft Office */
export function isOfficeHtml(html: string): boolean {
  return OFFICE_SIGNATURES.some((sig) => html.includes(sig));
}

/** Style declarations the editor supports (everything else is junk) */
const KEPT_STYLES = new Set([
  'color',
  'background-color',
  // Docs/Word mark bold/italic/underline/strike with span styles rather
  // than semantic tags; ProseMirror parses these into real marks.
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
]);

function cleanElement(el: Element): void {
  // Word XML-namespaced elements (<o:p>, <w:sdt>, ...) contribute nothing
  if (el.tagName.includes(':')) {
    el.remove();
    return;
  }

  if (el.hasAttribute('class')) {
    el.removeAttribute('class');
  }
  if (el.hasAttribute('lang')) {
    el.removeAttribute('lang');
  }
  if (el.hasAttribute('id')) {
    el.removeAttribute('id');
  }

  if (el.hasAttribute('style')) {
    // Parse the attribute text directly (not CSSStyleDeclaration) so the
    // result is identical across browsers and DOM test environments.
    const declarations = (el.getAttribute('style') ?? '')
      .split(';')
      .map((decl) => decl.trim())
      .filter((decl) => decl.includes(':'));
    const kept: string[] = [];
    for (const decl of declarations) {
      const colon = decl.indexOf(':');
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if (!KEPT_STYLES.has(prop)) {
        continue;
      }
      // Office emits default inks explicitly; dropping them keeps content
      // on theme text color instead of hardcoded near-black
      if (prop === 'color' && /^(rgb\(0,\s*0,\s*0\)|#000000|#000|windowtext)$/i.test(value)) {
        continue;
      }
      if (prop === 'background-color' && /^(transparent|#ffffff|#fff|rgb\(255,\s*255,\s*255\))$/i.test(value)) {
        continue;
      }
      // Non-emphasis values are the office default state, not authored marks
      if (prop === 'font-weight' && !/^(bold(er)?|[5-9]\d\d)$/i.test(value)) {
        continue;
      }
      if (prop === 'font-style' && !/^(italic|oblique)/i.test(value)) {
        continue;
      }
      if ((prop === 'text-decoration' || prop === 'text-decoration-line') && !/(underline|line-through)/i.test(value)) {
        continue;
      }
      kept.push(`${prop}: ${value}`);
    }
    if (kept.length > 0) {
      el.setAttribute('style', kept.join('; '));
    } else {
      el.removeAttribute('style');
    }
  }

  for (const child of [...el.children]) {
    cleanElement(child);
  }
}

/**
 * Sanitize office-suite clipboard HTML. Non-office HTML is returned as-is
 * (regular web copy already parses cleanly).
 */
export function cleanPastedHtml(html: string): string {
  if (typeof document === 'undefined' || !isOfficeHtml(html)) {
    return html;
  }

  // Strip XML islands and conditional comments before parsing
  const source = html
    .replaceAll(/<xml>[\s\S]*?<\/xml>/gi, '')
    .replaceAll(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replaceAll(/<!--StartFragment-->|<!--EndFragment-->/gi, '');

  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('style, meta, link, script, title').forEach((el) => {
    el.remove();
  });

  // Google Docs: unwrap the non-bold <b> guid wrapper so content is not bold
  for (const b of [...doc.body.querySelectorAll('b')]) {
    const weight = b.style.fontWeight;
    if (weight === 'normal' || weight === '400') {
      b.replaceWith(...b.childNodes);
    }
  }

  for (const child of [...doc.body.children]) {
    cleanElement(child);
  }

  return doc.body.innerHTML;
}
