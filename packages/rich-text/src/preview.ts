/**
 * Lightweight HTML -> preview-block parser for the native inline preview.
 *
 * The native RichEditor renders committed content as a compact, read-only
 * preview surface (tap to open the fullscreen editor). A WebView per field is
 * too heavy for that, so this parses the editor's own HTML output (Tiptap /
 * 10Tap both emit a small, predictable tag set) into styled text blocks.
 *
 * Not a general HTML parser -- it understands exactly what the editor emits:
 * p, h1-h6, ul/ol/li (incl. 10Tap taskList), blockquote, br, img and the
 * inline marks strong/b, em/i, u, s/strike/del, code. Everything else is
 * ignored (tags stripped, text kept).
 */

// ===========================================================================
// Types
// ===========================================================================

export interface PreviewSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
}

export type PreviewBlockKind =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bullet'
  | 'ordered'
  | 'task';

export interface PreviewBlock {
  kind: PreviewBlockKind;
  spans: PreviewSpan[];
  /** Inside a blockquote */
  quote?: boolean;
  /** Nested-list depth (0 = top level) */
  indent?: number;
  /** 1-based number for ordered list items */
  index?: number;
  /** Checked state for task list items */
  checked?: boolean;
}

export interface PreviewResult {
  blocks: PreviewBlock[];
  /** True when content was cut off at maxBlocks */
  truncated: boolean;
}

// ===========================================================================
// Entities
// ===========================================================================

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// ===========================================================================
// Empty check
// ===========================================================================

/** True when the HTML has no visible text and no image (e.g. "" or "<p></p>") */
export function isPreviewEmpty(html: string | null | undefined): boolean {
  if (!html) {
    return true;
  }
  if (/<img[\s>]/i.test(html)) {
    return false;
  }
  return decodeEntities(html.replaceAll(/<[^>]*>/g, '')).trim().length === 0;
}

// ===========================================================================
// Parser
// ===========================================================================

const HEADING_KINDS: Record<string, PreviewBlockKind> = {
  h1: 'heading1',
  h2: 'heading2',
  h3: 'heading3',
  h4: 'heading4',
  h5: 'heading5',
  h6: 'heading6',
};

interface ListFrame {
  type: 'ul' | 'ol' | 'task';
  counter: number;
}

export function parseHtmlPreview(html: string | null | undefined, maxBlocks = 6): PreviewResult {
  const blocks: PreviewBlock[] = [];
  let truncated = false;
  if (!html) {
    return { blocks, truncated };
  }

  let current: PreviewBlock | null = null;
  const marks = { bold: 0, italic: 0, underline: 0, strike: 0, code: 0 };
  const listStack: ListFrame[] = [];
  let quoteDepth = 0;
  let liDepth = 0;
  let capped = false;

  const flush = () => {
    if (!current) {
      return;
    }
    const { spans } = current;
    // trim outer whitespace, drop blanks
    const [first] = spans;
    const last = spans.at(-1);
    if (first && last) {
      first.text = first.text.replace(/^\s+/, '');
      last.text = last.text.replace(/\s+$/, '');
    }
    const kept = spans.filter((s) => s.text.length > 0);
    if (kept.some((s) => s.text.trim().length > 0)) {
      current.spans = kept;
      blocks.push(current);
      if (blocks.length >= maxBlocks) {
        capped = true;
      }
    }
    current = null;
  };

  const open = (kind: PreviewBlockKind, extra?: Partial<PreviewBlock>) => {
    flush();
    if (capped) {
      truncated = true;
      return;
    }
    current = { kind, spans: [], ...(quoteDepth > 0 && { quote: true }), ...extra };
  };

  const appendText = (raw: string) => {
    const text = decodeEntities(raw).replaceAll(/\s+/g, ' ');
    if (text.length === 0) {
      return;
    }
    if (capped && !current) {
      if (text.trim().length > 0) {
        truncated = true;
      }
      return;
    }
    if (!current) {
      if (text.trim().length === 0) {
        return;
      }
      // stray text without a block wrapper (e.g. bare text at the root)
      current = { kind: 'paragraph', spans: [], ...(quoteDepth > 0 && { quote: true }) };
    }
    const span: PreviewSpan = {
      text,
      ...(marks.bold > 0 && { bold: true }),
      ...(marks.italic > 0 && { italic: true }),
      ...(marks.underline > 0 && { underline: true }),
      ...(marks.strike > 0 && { strike: true }),
      ...(marks.code > 0 && { code: true }),
    };
    const last = current.spans.at(-1);
    if (
      last &&
      !!last.bold === !!span.bold &&
      !!last.italic === !!span.italic &&
      !!last.underline === !!span.underline &&
      !!last.strike === !!span.strike &&
      !!last.code === !!span.code
    ) {
      last.text += span.text;
    } else {
      current.spans.push(span);
    }
  };

  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      appendText(token);
      continue;
    }
    const tagMatch = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(token);
    if (!tagMatch) {
      continue;
    }
    const closing = tagMatch[1] === '/';
    const name = tagMatch[2].toLowerCase();
    const attrs = tagMatch[3] ?? '';

    switch (name) {
      case 'p': {
        if (liDepth > 0) {
          // paragraphs inside a list item flow into the item text
          if (!closing) {
            appendText(' ');
          }
        } else if (closing) {
          flush();
        } else {
          open('paragraph');
        }
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        if (closing) {
          flush();
        } else {
          open(HEADING_KINDS[name]);
        }
        break;
      }
      case 'br': {
        appendText(' ');
        break;
      }
      case 'ul': {
        if (closing) {
          listStack.pop();
        } else {
          listStack.push({
            type: /data-type\s*=\s*["']taskList["']/i.test(attrs) ? 'task' : 'ul',
            counter: 0,
          });
        }
        break;
      }
      case 'ol': {
        if (closing) {
          listStack.pop();
        } else {
          listStack.push({ type: 'ol', counter: 0 });
        }
        break;
      }
      case 'li': {
        if (closing) {
          liDepth = Math.max(0, liDepth - 1);
          flush();
          break;
        }
        const frame = listStack.at(-1) ?? { type: 'ul' as const, counter: 0 };
        const indent = Math.max(0, listStack.length - 1);
        if (frame.type === 'ol') {
          frame.counter += 1;
          open('ordered', { indent, index: frame.counter });
        } else if (frame.type === 'task') {
          open('task', { indent, checked: /data-checked\s*=\s*["']true["']/i.test(attrs) });
        } else {
          open('bullet', { indent });
        }
        liDepth += 1;
        break;
      }
      case 'blockquote': {
        flush();
        quoteDepth = Math.max(0, quoteDepth + (closing ? -1 : 1));
        break;
      }
      case 'strong':
      case 'b': {
        marks.bold = Math.max(0, marks.bold + (closing ? -1 : 1));
        break;
      }
      case 'em':
      case 'i': {
        marks.italic = Math.max(0, marks.italic + (closing ? -1 : 1));
        break;
      }
      case 'u': {
        marks.underline = Math.max(0, marks.underline + (closing ? -1 : 1));
        break;
      }
      case 's':
      case 'strike':
      case 'del': {
        marks.strike = Math.max(0, marks.strike + (closing ? -1 : 1));
        break;
      }
      case 'code': {
        marks.code = Math.max(0, marks.code + (closing ? -1 : 1));
        break;
      }
      case 'img': {
        if (!closing) {
          appendText('[image]');
        }
        break;
      }
      default: {
        // input/label/div/span/a/mark/... -- structure ignored, text kept
        break;
      }
    }
  }
  flush();
  return { blocks, truncated };
}
