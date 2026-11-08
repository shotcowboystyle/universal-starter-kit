import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

interface PassedOptions {
  items: (args: { query: string }) => Item[];
}

const suggestion = vi.hoisted(() => ({
  fn: vi.fn<(options: PassedOptions) => { props: object }>(() => ({ props: {} })),
}));

vi.mock<object>(import('@tiptap/suggestion'), () => ({ default: suggestion.fn, Suggestion: suggestion.fn }));

const { SlashCommands } = await import('./SlashCommands');

interface Item {
  id: string;
  title: string;
  description: string;
  command: (a: any) => void;
}

const items = (query = ''): Item[] => (SlashCommands as any).options.suggestion.items({ query });

const ids = (list: Item[]) => list.map((i) => i.id);

/** Records every link in the command chain so an assertion can read the whole call. */
const makeEditor = (
  storage: { mediaUpload?: { handlers: { onImageUpload?: (file: File) => Promise<string> } } } = {},
) => {
  const calls: [string, ...unknown[]][] = [];
  const chain: any = new Proxy(
    {},
    {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return chain;
        },
    },
  );
  return {
    editor: { chain: () => chain, storage } as any,
    calls,
    names: () => calls.map((c) => c[0]),
  };
};

const RANGE = { from: 3, to: 4 };

const run = (id: string, editor: any) => {
  const item = items().find((i) => i.id === id);
  if (!item) {
    throw new Error(`no slash item "${id}"`);
  }
  item.command({ editor, range: RANGE });
};

describe('SlashCommands', () => {
  // happy-dom does not implement window.prompt, so install one to observe.
  let promptSpy: Mock<(message?: string) => string | null>;
  let originalPrompt: typeof window.prompt;

  beforeEach(() => {
    suggestion.fn.mockClear();
    originalPrompt = window.prompt;
    promptSpy = vi.fn<(message?: string) => string | null>(() => null);
    (window as any).prompt = promptSpy;
  });

  afterEach(() => {
    (window as any).prompt = originalPrompt;
  });

  it('triggers on a slash anywhere in the line, not only at its start', () => {
    const { suggestion: cfg } = (SlashCommands as any).options;
    expect(cfg.char).toBe('/');
    expect(cfg.startOfLine).toBe(false);
  });

  it('offers the whole block catalog on an empty query', () => {
    expect(ids(items())).toStrictEqual([
      'text',
      'heading1',
      'heading2',
      'heading3',
      'bulletList',
      'orderedList',
      'taskList',
      'codeBlock',
      'blockquote',
      'horizontalRule',
      'table',
      'image',
      'mermaid',
      'mathBlock',
      'inlineMath',
      'details',
      'emoji',
    ]);
  });

  it('matches titles without regard to case', () => {
    expect(ids(items('HEAD'))).toStrictEqual(['heading1', 'heading2', 'heading3']);
    expect(ids(items('head'))).toStrictEqual(ids(items('HEAD')));
  });

  it('matches the description too, not the title alone', () => {
    // "checkboxes" appears only in the Task List description
    const byDescription = items('checkboxes');
    expect(ids(byDescription)).toStrictEqual(['taskList']);
    expect(byDescription[0].title.toLowerCase()).not.toContain('checkboxes');
  });

  it('returns an empty list rather than the catalog when nothing matches', () => {
    expect(items('zzzznotathing')).toStrictEqual([]);
  });

  it('excludeIds removes exactly the named ids from what the suggestion plugin is handed', () => {
    const ext = (SlashCommands as any).configure({ excludeIds: ['table', 'image', 'emoji'] });
    ext.config.addProseMirrorPlugins.call({ options: ext.options, editor: null });

    expect(suggestion.fn).toHaveBeenCalledOnce();
    const [[passed]] = suggestion.fn.mock.calls;
    const filtered = ids(passed.items({ query: '' }));

    expect(filtered).not.toContain('table');
    expect(filtered).not.toContain('image');
    expect(filtered).not.toContain('emoji');
    expect(filtered).toHaveLength(items().length - 3);
    expect(filtered).toStrictEqual(ids(items()).filter((id) => !['table', 'image', 'emoji'].includes(id)));
  });

  it('an empty excludeIds leaves the catalog whole', () => {
    const ext = (SlashCommands as any).configure({});
    ext.config.addProseMirrorPlugins.call({ options: ext.options, editor: null });
    const [[passed]] = suggestion.fn.mock.calls;
    expect(ids(passed.items({ query: '' }))).toStrictEqual(ids(items()));
  });

  it('every command deletes the typed trigger range before it inserts anything', () => {
    for (const id of ['text', 'heading1', 'bulletList', 'codeBlock', 'table', 'details']) {
      const { editor, calls } = makeEditor();
      run(id, editor);
      const deleteCall = calls.find(([name]) => name === 'deleteRange');
      expect(deleteCall, `${id} left the "/" behind`).toStrictEqual(['deleteRange', RANGE]);
    }
  });

  it('headings carry their level, and Text resets to a paragraph', () => {
    const h2 = makeEditor();
    run('heading2', h2.editor);
    expect(h2.calls).toContainEqual(['setHeading', { level: 2 }]);

    const p = makeEditor();
    run('text', p.editor);
    expect(p.names()).toStrictEqual(['focus', 'deleteRange', 'setParagraph', 'run']);
  });

  it('Table inserts a 3x3 grid with a header row', () => {
    const { editor, calls } = makeEditor();
    run('table', editor);
    expect(calls).toContainEqual(['insertTable', { rows: 3, cols: 3, withHeaderRow: true }]);
  });

  it('Mermaid and Math Block are code blocks with a language, not bespoke nodes', () => {
    const mermaid = makeEditor();
    run('mermaid', mermaid.editor);
    expect(mermaid.calls).toContainEqual(['setCodeBlock', { language: 'mermaid' }]);

    const math = makeEditor();
    run('mathBlock', math.editor);
    expect(math.calls).toContainEqual(['setCodeBlock', { language: 'math' }]);
  });

  it('a collapsible section is inserted already open, so it can be typed into', () => {
    const { editor, calls, names } = makeEditor();
    run('details', editor);
    expect(names()).toStrictEqual(['focus', 'deleteRange', 'setDetails', 'updateAttributes', 'run']);
    expect(calls).toContainEqual(['updateAttributes', 'details', { open: true }]);
  });

  it('Emoji hands off to the emoji popup by typing its trigger', () => {
    const { editor, calls } = makeEditor();
    run('emoji', editor);
    expect(calls).toContainEqual(['insertContent', ':']);
  });

  it('Image prompts for a URL only when no upload handler is wired', () => {
    promptSpy.mockReturnValue('https://example.com/a.png');
    const { editor, calls } = makeEditor();

    run('image', editor);

    expect(promptSpy).toHaveBeenCalledWith('Image URL:');
    expect(calls).toContainEqual(['deleteRange', RANGE]);
    expect(calls).toContainEqual(['setImage', { src: 'https://example.com/a.png' }]);
  });

  it('a dismissed URL prompt inserts nothing', () => {
    promptSpy.mockReturnValue(null);
    const { editor, calls } = makeEditor();

    run('image', editor);

    expect(calls).toStrictEqual([]);
  });

  it('Image opens the file picker instead of prompting when an upload handler exists', () => {
    const onImageUpload = vi.fn<(file: File) => Promise<string>>(async () => 'https://cdn.example.com/x.png');
    const { editor, calls } = makeEditor({ mediaUpload: { handlers: { onImageUpload } } });

    run('image', editor);

    expect(promptSpy).not.toHaveBeenCalled();
    // the picker is opened and nothing is inserted until a file comes back
    expect(calls).toStrictEqual([]);
  });
});
