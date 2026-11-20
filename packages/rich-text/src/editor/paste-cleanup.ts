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
export const isOfficeHtml = (html: string): boolean => OFFICE_SIGNATURES.some((sig) => html.includes(sig));

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

// Office emits default inks explicitly; dropping them keeps content on theme
// text color instead of hardcoded near-black
const DEFAULT_INK = /^(?:rgb\(0,\s*0,\s*0\)|#000000|#000|windowtext)$/iu;
const DEFAULT_BACKGROUND = /^(?:transparent|#ffffff|#fff|rgb\(255,\s*255,\s*255\))$/iu;
// Non-emphasis values are the office default state, not authored marks
const EMPHASIS_WEIGHT = /^(?:bold(?:er)?|[5-9]\d\d)$/iu;
const EMPHASIS_STYLE = /^(?:italic|oblique)/iu;
const EMPHASIS_DECORATION = /underline|line-through/iu;

/** True when a declaration carries styling the editor supports and the author set */
const isKeptDeclaration = (prop: string, value: string): boolean => {
  if (!KEPT_STYLES.has(prop)) {
    return false;
  }
  switch (prop) {
    case 'color': {
      return !DEFAULT_INK.test(value);
    }
    case 'background-color': {
      return !DEFAULT_BACKGROUND.test(value);
    }
    case 'font-weight': {
      return EMPHASIS_WEIGHT.test(value);
    }
    case 'font-style': {
      return EMPHASIS_STYLE.test(value);
    }
    // text-decoration and text-decoration-line
    default: {
      return EMPHASIS_DECORATION.test(value);
    }
  }
};

const cleanStyle = (el: Element): void => {
  // Parse the attribute text directly (not CSSStyleDeclaration) so the
  // result is identical across browsers and DOM test environments.
  const kept = (el.getAttribute('style') ?? '')
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl.includes(':'))
    .map((decl) => {
      const colon = decl.indexOf(':');
      return { prop: decl.slice(0, colon).trim().toLowerCase(), value: decl.slice(colon + 1).trim() };
    })
    .filter(({ prop, value }) => isKeptDeclaration(prop, value))
    .map(({ prop, value }) => `${prop}: ${value}`);
  if (kept.length > 0) {
    el.setAttribute('style', kept.join('; '));
  } else {
    el.removeAttribute('style');
  }
};

const cleanElement = (el: Element): void => {
  // Word XML-namespaced elements (<o:p>, <w:sdt>, ...) contribute nothing
  if (el.tagName.includes(':')) {
    el.remove();
    return;
  }

  el.removeAttribute('class');
  el.removeAttribute('lang');
  el.removeAttribute('id');

  if (el.hasAttribute('style')) {
    cleanStyle(el);
  }

  // Snapshot: `children` is live and cleanElement may remove the child
  // oxlint-disable-next-line unicorn/no-useless-spread -- copies a live HTMLCollection that the loop mutates
  for (const child of [...el.children]) {
    cleanElement(child);
  }
};

/**
 * Sanitize office-suite clipboard HTML. Non-office HTML is returned as-is
 * (regular web copy already parses cleanly).
 */
export const cleanPastedHtml = (html: string): string => {
  if (typeof document === 'undefined' || !isOfficeHtml(html)) {
    return html;
  }

  // Strip XML islands and conditional comments before parsing
  const source = html
    .replaceAll(/<xml>[\s\S]*?<\/xml>/giu, '')
    .replaceAll(/<!--\[if[\s\S]*?<!\[endif\]-->/giu, '')
    .replaceAll(/<!--StartFragment-->|<!--EndFragment-->/giu, '');

  const doc = new DOMParser().parseFromString(source, 'text/html');
  for (const el of doc.querySelectorAll('style, meta, link, script, title')) {
    el.remove();
  }

  // Google Docs: unwrap the non-bold <b> guid wrapper so content is not bold
  for (const b of doc.body.querySelectorAll('b')) {
    const weight = b.style.fontWeight;
    if (weight === 'normal' || weight === '400') {
      b.replaceWith(...b.childNodes);
    }
  }

  // oxlint-disable-next-line unicorn/no-useless-spread -- copies a live HTMLCollection that the loop mutates
  for (const child of [...doc.body.children]) {
    cleanElement(child);
  }

  // oxlint-disable-next-line github/no-inner-html -- serializes the parsed document back to a string; nothing is assigned
  return doc.body.innerHTML;
};
