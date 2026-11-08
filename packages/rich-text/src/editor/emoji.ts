/**
 * `:emoji:` autocomplete for the rich text editor (web) — GitLab parity.
 *
 * Third suggestion source on the shared LC-16 popup (same rows, chrome,
 * keyboard handling, and ARIA roles as slash commands and @ mentions).
 * Typing `:` opens a searchable shortname list; selecting inserts the plain
 * unicode character (like GitLab's editor), so the markdown round-trip is
 * lossless by construction — an emoji is just text.
 *
 * Bundle discipline: the emoji dataset (emojilib, ~32 KB gz) is NOT in the
 * editor chunk. It is dynamically imported on the first `:` trigger and
 * cached for the session.
 */

import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import Suggestion from '@tiptap/suggestion';

import { t } from '../shared/t';

import { createSuggestionRenderer, getSuggestionChrome } from './suggestion-popup';

// ===========================================================================
// Dataset (lazy)
// ===========================================================================

export interface EmojiEntry {
  /** Shortname, e.g. "thumbsup" (typed between colons) */
  name: string;
  /** The unicode character inserted into the document */
  char: string;
  /** Search keywords from the dataset */
  keywords: string[];
}

let emojiIndexPromise: Promise<EmojiEntry[]> | null = null;

/**
 * Loads and flattens the emojilib dataset on first use. The dynamic import
 * keeps the JSON out of the editor chunk (zero eager bytes); the promise is
 * cached so the fetch happens at most once per session.
 */
const buildEmojiIndex = async (): Promise<EmojiEntry[]> => {
  const { default: lib } = await import('emojilib/emojis.json');
  const entries: EmojiEntry[] = [];
  for (const [name, value] of Object.entries(lib)) {
    if (value.char === undefined || value.char === '') {
      continue;
    }
    entries.push({ name, char: value.char, keywords: value.keywords ?? [] });
  }
  return entries;
};

// Not `async`: an async wrapper would hand out a fresh promise per call, and
// callers rely on getting the one cached promise back.
// oxlint-disable-next-line typescript/promise-function-async -- returns the cached promise by identity
export const loadEmojiIndex = (): Promise<EmojiEntry[]> => {
  emojiIndexPromise ??= buildEmojiIndex();
  return emojiIndexPromise;
};

/** Test seam: reset the cached dataset promise */
export const resetEmojiIndexForTesting = (): void => {
  emojiIndexPromise = null;
};

// ===========================================================================
// Search
// ===========================================================================

/**
 * Ranked shortname search: exact name, name prefix, name substring, then
 * keyword prefix/substring. Ties keep dataset order (faces first), matching
 * the GitLab popup's feel. An empty query lists the head of the dataset.
 */
export const searchEmoji = (entries: EmojiEntry[], query: string, limit = 20): EmojiEntry[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entries.slice(0, limit);
  }

  const tiers: EmojiEntry[][] = [[], [], [], []];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (name === q) {
      tiers[0].push(entry);
    } else if (name.startsWith(q)) {
      tiers[1].push(entry);
    } else if (name.includes(q)) {
      tiers[2].push(entry);
    } else if (entry.keywords.some((keyword) => keyword.toLowerCase().startsWith(q))) {
      tiers[3].push(entry);
    }
    if (tiers[0].length + tiers[1].length >= limit) {
      break;
    }
  }
  return tiers.flat().slice(0, limit);
};

// ===========================================================================
// Extension
// ===========================================================================

/** Inserts the unicode character, replacing the `:query` trigger text */
export const insertEmoji = (editor: Editor, range: Range, char: string): void => {
  editor.chain().focus().insertContentAt(range, char).run();
};

const EmojiSuggestionPluginKey = new PluginKey('emojiSuggestion');

/**
 * `:` trigger suggestion menu. Own plugin key — the slash menu owns the
 * default Suggestion key and the two must coexist.
 */
export const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: ':',
        pluginKey: EmojiSuggestionPluginKey,
        startOfLine: false,
        items: async ({ query }: { query: string }): Promise<EmojiEntry[]> =>
          searchEmoji(await loadEmojiIndex(), query),
        render: createSuggestionRenderer<EmojiEntry>({
          toRow: (item) => ({
            key: item.name,
            title: `:${item.name}:`,
            description: item.keywords.slice(0, 3).join(', ') || undefined,
            icon: item.char,
          }),
          getChrome: getSuggestionChrome,
          getEmptyLabel: () => t('No results'),
        }),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: EmojiEntry }) => {
          insertEmoji(editor, range, props.char);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
