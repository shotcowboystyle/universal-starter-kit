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

const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);

const decodeNumericEntity = (entity: string): number =>
  entity[1] === 'x' || entity[1] === 'X'
    ? Number.parseInt(entity.slice(2), 16)
    : // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseInt's stop-at-first-non-digit leniency is the intended decoding
      Number.parseInt(entity.slice(1), 10);

export const decodeEntities = (text: string): string =>
  text.replaceAll(/&(?<entity>#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = decodeNumericEntity(entity);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(entity.toLowerCase()) ?? match;
  });

// ===========================================================================
// Empty check
// ===========================================================================

/** True when the HTML has no visible text and no image (e.g. "" or "<p></p>") */
export const isPreviewEmpty = (html: string | null | undefined): boolean => {
  if ((html ?? '') === '') {
    return true;
  }
  const source = html ?? '';
  if (/<img[\s>]/iu.test(source)) {
    return false;
  }
  return decodeEntities(source.replaceAll(/<[^<>]*>/gu, '')).trim().length === 0;
};

// ===========================================================================
// Parser
// ===========================================================================

const HEADING_KINDS = new Map<string, PreviewBlockKind>([
  ['h1', 'heading1'],
  ['h2', 'heading2'],
  ['h3', 'heading3'],
  ['h4', 'heading4'],
  ['h5', 'heading5'],
  ['h6', 'heading6'],
]);

const MARK_KEYS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;
type MarkKey = (typeof MARK_KEYS)[number];

const MARK_TAGS = new Map<string, MarkKey>([
  ['strong', 'bold'],
  ['b', 'bold'],
  ['em', 'italic'],
  ['i', 'italic'],
  ['u', 'underline'],
  ['s', 'strike'],
  ['strike', 'strike'],
  ['del', 'strike'],
  ['code', 'code'],
]);

interface ListFrame {
  type: 'ul' | 'ol' | 'task';
  counter: number;
}

interface ParserState {
  blocks: PreviewBlock[];
  truncated: boolean;
  current: PreviewBlock | null;
  marks: Record<MarkKey, number>;
  listStack: ListFrame[];
  quoteDepth: number;
  liDepth: number;
  capped: boolean;
  maxBlocks: number;
}

const sameMarks = (a: PreviewSpan, b: PreviewSpan): boolean =>
  MARK_KEYS.every((key) => (a[key] ?? false) === (b[key] ?? false));

const flush = (st: ParserState): void => {
  const { current } = st;
  if (current === null) {
    return;
  }
  const { spans } = current;
  // trim outer whitespace, drop blanks
  const first = spans.at(0);
  const last = spans.at(-1);
  if (first !== undefined && last !== undefined) {
    first.text = first.text.trimStart();
    last.text = last.text.trimEnd();
  }
  const kept = spans.filter((s) => s.text.length > 0);
  if (kept.some((s) => s.text.trim().length > 0)) {
    current.spans = kept;
    st.blocks.push(current);
    if (st.blocks.length >= st.maxBlocks) {
      st.capped = true;
    }
  }
  st.current = null;
};

const open = (st: ParserState, kind: PreviewBlockKind, extra?: Partial<PreviewBlock>): void => {
  flush(st);
  if (st.capped) {
    st.truncated = true;
    return;
  }
  st.current = { kind, spans: [], ...(st.quoteDepth > 0 && { quote: true }), ...extra };
};

const appendText = (st: ParserState, raw: string): void => {
  const text = decodeEntities(raw).replaceAll(/\s+/gu, ' ');
  if (text.length === 0) {
    return;
  }
  if (st.capped && st.current === null) {
    if (text.trim().length > 0) {
      st.truncated = true;
    }
    return;
  }
  if (st.current === null) {
    if (text.trim().length === 0) {
      return;
    }
    // stray text without a block wrapper (e.g. bare text at the root)
    st.current = { kind: 'paragraph', spans: [], ...(st.quoteDepth > 0 && { quote: true }) };
  }
  const span: PreviewSpan = { text };
  for (const key of MARK_KEYS) {
    if (st.marks[key] > 0) {
      span[key] = true;
    }
  }
  const last = st.current.spans.at(-1);
  if (last !== undefined && sameMarks(last, span)) {
    last.text += span.text;
  } else {
    st.current.spans.push(span);
  }
};

const openListItem = (st: ParserState, attrs: string): void => {
  const frame = st.listStack.at(-1) ?? { type: 'ul' as const, counter: 0 };
  const indent = Math.max(0, st.listStack.length - 1);
  if (frame.type === 'ol') {
    frame.counter += 1;
    open(st, 'ordered', { indent, index: frame.counter });
  } else if (frame.type === 'task') {
    open(st, 'task', { indent, checked: /data-checked\s*=\s*["']true["']/iu.test(attrs) });
  } else {
    open(st, 'bullet', { indent });
  }
  st.liDepth += 1;
};

const handleParagraph = (st: ParserState, closing: boolean): void => {
  if (st.liDepth > 0) {
    // paragraphs inside a list item flow into the item text
    if (!closing) {
      appendText(st, ' ');
    }
  } else if (closing) {
    flush(st);
  } else {
    open(st, 'paragraph');
  }
};

const handleStructuralTag = (st: ParserState, name: string, closing: boolean, attrs: string): void => {
  switch (name) {
    case 'p': {
      handleParagraph(st, closing);
      break;
    }
    case 'br': {
      appendText(st, ' ');
      break;
    }
    case 'ul':
    case 'ol': {
      if (closing) {
        st.listStack.pop();
      } else if (name === 'ol') {
        st.listStack.push({ type: 'ol', counter: 0 });
      } else {
        st.listStack.push({ type: /data-type\s*=\s*["']taskList["']/iu.test(attrs) ? 'task' : 'ul', counter: 0 });
      }
      break;
    }
    case 'li': {
      if (closing) {
        st.liDepth = Math.max(0, st.liDepth - 1);
        flush(st);
      } else {
        openListItem(st, attrs);
      }
      break;
    }
    case 'blockquote': {
      flush(st);
      st.quoteDepth = Math.max(0, st.quoteDepth + (closing ? -1 : 1));
      break;
    }
    case 'img': {
      if (!closing) {
        appendText(st, '[image]');
      }
      break;
    }
    default: {
      // input/label/div/span/a/mark/... -- structure ignored, text kept
      break;
    }
  }
};

const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9]*/u;

/** `token` is a whole `<...>` tag as produced by the tokenizer. */
const handleTag = (st: ParserState, token: string): void => {
  let inner = token.slice(1, -1).trim();
  const closing = inner.startsWith('/');
  if (closing) {
    inner = inner.slice(1).trimStart();
  }
  const rawName = TAG_NAME.exec(inner)?.[0];
  if (rawName === undefined) {
    return;
  }
  const name = rawName.toLowerCase();
  const attrs = inner.slice(rawName.length);

  const mark = MARK_TAGS.get(name);
  if (mark !== undefined) {
    st.marks[mark] = Math.max(0, st.marks[mark] + (closing ? -1 : 1));
    return;
  }
  const heading = HEADING_KINDS.get(name);
  if (heading !== undefined) {
    if (closing) {
      flush(st);
    } else {
      open(st, heading);
    }
    return;
  }
  handleStructuralTag(st, name, closing, attrs);
};

export const parseHtmlPreview = (html: string | null | undefined, maxBlocks = 6): PreviewResult => {
  const st: ParserState = {
    blocks: [],
    truncated: false,
    current: null,
    marks: { bold: 0, italic: 0, underline: 0, strike: 0, code: 0 },
    listStack: [],
    quoteDepth: 0,
    liDepth: 0,
    capped: false,
    maxBlocks,
  };
  const tokens = (html ?? '').match(/<[^<>]*>|[^<]+/gu) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<')) {
      handleTag(st, token);
    } else {
      appendText(st, token);
    }
  }
  flush(st);
  return { blocks: st.blocks, truncated: st.truncated };
};
