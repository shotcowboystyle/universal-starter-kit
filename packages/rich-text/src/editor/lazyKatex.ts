/**
 * Lazy KaTeX renderer for `$...$` inline and `$$...$$` block math.
 *
 * Bundle discipline: KaTeX (~70 KB gz JS + CSS + fonts) never rides the
 * editor chunk. Both the library and its stylesheet load through dynamic
 * import on the first math render and are cached for the session. The
 * stylesheet colors inherit `currentColor`, so dark schemes work without
 * a separate dark CSS pass.
 *
 * The result contract is Axiom 6 friendly — invalid TeX returns
 * `{ ok: false, error }` with KaTeX's parse message so callers can show
 * the error instead of a blank node.
 */

export type KatexRenderResult = { ok: true; html: string } | { ok: false; error: string };

type KatexModule = typeof import('katex').default;

let katexPromise: Promise<KatexModule> | null = null;

async function loadKatex(): Promise<KatexModule> {
  katexPromise ??= Promise.all([
    import('katex'),
    // the stylesheet (fonts included) code-splits with this async chunk
    import('katex/dist/katex.min.css'),
  ]).then(([mod]) => (mod as any).default ?? mod);
  return await katexPromise;
}

/** Renders TeX to KaTeX HTML markup (display mode for `$$` blocks) */
export async function renderKatexHtml(
  latex: string,
  options: { displayMode?: boolean } = {},
): Promise<KatexRenderResult> {
  try {
    const katex = await loadKatex();
    const html = katex.renderToString(latex, {
      displayMode: options.displayMode ?? false,
      throwOnError: true,
      strict: false,
    });
    return { ok: true, html };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Mounts KaTeX markup as real DOM nodes. KaTeX output is spans + MathML by
 * construction; parsing inert and stripping executables is defense in
 * depth, mirroring the mermaid mount helper.
 */
export function mountKatexHtml(container: HTMLElement, html: string): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of [...doc.body.querySelectorAll('script, iframe, object, embed')]) {
    el.remove();
  }
  container.replaceChildren(...[...doc.body.childNodes].map((node) => document.importNode(node, true)));
}

/** Test seam: reset the cached library promise */
export function resetKatexForTesting(): void {
  katexPromise = null;
}
