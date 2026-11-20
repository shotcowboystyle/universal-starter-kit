/**
 * Canonical HTML <-> Markdown conversion for the rich text editor (web).
 *
 * One implementation (LC-16) shared by the markdown source mode toggle and
 * the markdown paste handler. GFM coverage beyond turndown's defaults:
 * strikethrough, task lists (Tiptap's label-nested checkbox markup), and
 * pipe tables. Marks with no markdown syntax (underline, sub/superscript,
 * highlight, text color spans) survive as inline HTML so the
 * rich -> markdown -> rich round-trip is lossless for every toolbar feature.
 *
 * GitLab-flavored extras (round-trip lossless):
 * - `$x$` inline math <-> `<span data-type="inline-math" data-latex>`
 * - `$$ ... $$` block math <-> code block with language "math"
 *   (``` math fences parse to the same node; `$$` is the canonical output)
 * - ```mermaid fences <-> code block with language "mermaid" (turndown's
 *   fenced rule + marked's language classes handle this natively)
 * - `<details>` collapsible sections stay raw HTML in markdown, exactly
 *   like GitLab renders them
 */

import { Marked } from 'marked';
import TurndownService from 'turndown';

// ===========================================================================
// HTML -> Markdown (turndown + GFM rules)
// ===========================================================================

const cellMarkdown = (cell: HTMLElement, inline: TurndownService): string => {
  // turndown converts a node's children, same as passing its inner HTML
  const md = inline.turndown(cell);
  // GFM cells are single-line: collapse block breaks and escape pipes
  return md.replaceAll(/\n+/gu, ' ').replaceAll('|', '\\|').trim();
};

/** Inline-only converter for table cells (tables cannot nest in GFM cells) */
const createInlineTurndown = (): TurndownService => {
  const service = new TurndownService({ codeBlockStyle: 'fenced' });
  service.keep((node) => {
    const name = node.nodeName;
    if (name === 'U' || name === 'SUB' || name === 'SUP' || name === 'MARK') {
      return true;
    }
    if (name === 'SPAN') {
      return (node.getAttribute('style') ?? '').includes('color');
    }
    return false;
  });
  service.addRule('strikethrough', {
    filter: ['del', 's'],
    replacement: (content) => `~~${content}~~`,
  });
  return service;
};

const createTurndown = (): TurndownService => {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Marks markdown cannot express stay as inline HTML (round-trip lossless):
  // underline, sub/superscript, highlight, and color-carrying spans.
  // Collapsible <details> sections are raw HTML in markdown (GitLab
  // behavior) — kept whole, children included.
  service.keep((node) => {
    const name = node.nodeName;
    if (name === 'U' || name === 'SUB' || name === 'SUP' || name === 'MARK') {
      return true;
    }
    if (name === 'DETAILS') {
      return true;
    }
    if (name === 'SPAN') {
      const style = node.getAttribute('style') ?? '';
      return style.includes('color');
    }
    return false;
  });

  service.addRule('strikethrough', {
    filter: ['del', 's'],
    replacement: (content) => `~~${content}~~`,
  });

  // Inline math node -> `$latex$` (GitLab-flavored markdown dollar math)
  service.addRule('inlineMath', {
    filter: (node) => node.nodeName === 'SPAN' && node.dataset.type === 'inline-math',
    replacement: (_content, node) => `$${node.dataset.latex ?? ''}$`,
  });

  // Math code block -> `$$` delimited block (canonical GLFM display math)
  service.addRule('mathBlock', {
    filter: (node) =>
      node.nodeName === 'PRE' &&
      node.firstChild?.nodeName === 'CODE' &&
      // a CODE first child is an element, so it is also the first element child
      (node.firstElementChild?.getAttribute('class') ?? '').includes('language-math'),
    replacement: (_content, node) => {
      const code = node.firstChild?.textContent ?? '';
      return `\n\n$$\n${code.replace(/\n$/u, '')}\n$$\n\n`;
    },
  });

  // Tiptap task item: <li data-type="taskItem" data-checked="true">
  //   <label><input type="checkbox"><span></span></label><div><p>text</p></div>
  service.addRule('taskListItem', {
    filter: (node) => node.nodeName === 'LI' && node.dataset.type === 'taskItem',
    replacement: (content, node) => {
      const checked = node.dataset.checked === 'true';
      const text = content.trim().replaceAll(/\n{2,}/gu, '\n');
      return `- [${checked ? 'x' : ' '}] ${text}\n`;
    },
  });

  // The checkbox control inside the task item label contributes no text
  service.addRule('taskListCheckbox', {
    filter: (node) =>
      (node.nodeName === 'INPUT' && node.getAttribute('type')?.toLowerCase() === 'checkbox') ||
      (node.nodeName === 'LABEL' && node.parentElement?.dataset.type === 'taskItem'),
    replacement: () => '',
  });

  // GFM pipe tables (simple grid: no colspan/rowspan)
  service.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = [...node.querySelectorAll('tr')];
      if (rows.length === 0) {
        return '';
      }
      const inline = createInlineTurndown();
      const grid = rows.map((row) =>
        [...row.querySelectorAll<HTMLElement>('th, td')].map((cell) => cellMarkdown(cell, inline)),
      );
      const cols = Math.max(...grid.map((r) => r.length));
      const pad = (r: string[]) => {
        const filled = [...r];
        while (filled.length < cols) {
          filled.push('');
        }
        return filled;
      };
      const line = (cells: string[]) => `| ${pad(cells).join(' | ')} |`;
      const header = line(grid[0]);
      const divider = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
      const body = grid.slice(1).map(line);
      return `\n\n${[header, divider, ...body].join('\n')}\n\n`;
    },
  });

  return service;
};

let turndownSingleton: TurndownService | null = null;

/** Convert editor HTML to GFM markdown */
export const htmlToMarkdown = (html: string): string => {
  turndownSingleton ??= createTurndown();
  return turndownSingleton.turndown(html);
};

// ===========================================================================
// Markdown -> HTML (marked + math extensions + Tiptap task list upgrade)
// ===========================================================================

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * `$$ ... $$` display math -> math code block. Accepts the delimiters on
 * their own lines (canonical GLFM) or a single `$$x$$` line; both re-enter
 * the editor as a code block with language "math".
 */
const blockMathExtension = {
  name: 'blockMath',
  level: 'block' as const,
  start: (src: string) => /^\$\$/mu.exec(src)?.index,
  tokenizer(src: string) {
    const match =
      /^\$\$[ \t]*\n(?<latex>[\s\S]*?)\n[ \t]*\$\$[ \t]*(?:\n+|$)/u.exec(src) ??
      /^\$\$(?<latex>[^\n$]+?)\$\$[ \t]*(?:\n+|$)/u.exec(src);
    return match ? { type: 'blockMath', raw: match[0], latex: (match.groups?.latex ?? '').trim() } : undefined;
  },
  renderer(token: { latex: string }) {
    return `<pre><code class="language-math">${escapeHtml(token.latex)}</code></pre>\n`;
  },
};

/**
 * `$x^2$` inline math -> inline-math span. Content must not start or end
 * with whitespace and cannot span lines, so prose like "$5 and $10" never
 * false-positives (same heuristic GitLab/Pandoc use for dollar math).
 */
const inlineMathExtension = {
  name: 'inlineMath',
  level: 'inline' as const,
  start: (src: string) => src.indexOf('$'),
  tokenizer(src: string) {
    const match = /^\$(?<latex>[^$\n])\$/u.exec(src) ?? /^\$(?<latex>[^$\n \t][^$\n]*?[^$\n \t])\$/u.exec(src);
    return match ? { type: 'inlineMath', raw: match[0], latex: match.groups?.latex ?? '' } : undefined;
  },
  renderer(token: { latex: string }) {
    const escaped = escapeHtml(token.latex);
    return `<span data-type="inline-math" data-latex="${escaped}">${escaped}</span>`;
  },
};

let markedSingleton: Marked | null = null;

/** Local marked instance so math extensions never leak into the global */
const getMarked = (): Marked => {
  if (!markedSingleton) {
    markedSingleton = new Marked({ gfm: true });
    markedSingleton.use({ extensions: [blockMathExtension, inlineMathExtension] });
  }
  return markedSingleton;
};

/**
 * marked emits GFM task items as `<li><input type="checkbox" checked>`;
 * Tiptap's TaskList/TaskItem parse `ul[data-type="taskList"] >
 * li[data-type="taskItem"][data-checked]`. Upgrade in the DOM so the
 * round-trip re-enters the editor as real task items.
 */
const upgradeTaskLists = (html: string): string => {
  if (typeof document === 'undefined' || !html.includes('checkbox')) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const input of doc.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')) {
    const li = input.closest('li');
    if (!li) {
      continue;
    }
    li.dataset.type = 'taskItem';
    li.dataset.checked = input.checked || input.hasAttribute('checked') ? 'true' : 'false';
    input.remove();
    const list = li.closest<HTMLElement>('ul, ol');
    if (list) {
      list.dataset.type = 'taskList';
    }
  }
  // oxlint-disable-next-line github/no-inner-html -- serializes the parsed document back to a string; nothing is assigned
  return doc.body.innerHTML;
};

/** Convert GFM markdown to HTML the Tiptap schema can ingest */
export const markdownToHtml = (markdown: string): string => {
  const html = getMarked().parse(markdown, { async: false });
  return upgradeTaskLists(html);
};
