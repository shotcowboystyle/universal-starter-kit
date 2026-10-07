import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { EmojiSuggestion, insertEmoji, loadEmojiIndex, searchEmoji } from './emoji';
import type { EmojiEntry } from './emoji';

const ENTRIES: EmojiEntry[] = [
  { name: 'smile', char: '😄', keywords: ['face', 'happy'] },
  { name: 'smiley', char: '😃', keywords: ['face', 'happy'] },
  { name: 'sweat_smile', char: '😅', keywords: ['face', 'hot'] },
  { name: 'cat', char: '🐱', keywords: ['animal', 'meow'] },
  { name: 'tada', char: '🎉', keywords: ['party', 'celebration', 'smashing'] },
];

describe(searchEmoji, () => {
  it('returns the head of the dataset for an empty query', () => {
    expect(searchEmoji(ENTRIES, '', 3).map((e) => e.name)).toEqual(['smile', 'smiley', 'sweat_smile']);
  });

  it('ranks exact name over prefix over substring over keyword', () => {
    const names = searchEmoji(ENTRIES, 'smile').map((e) => e.name);
    // exact: smile; prefix: smiley; substring: sweat_smile; keyword: none
    expect(names).toEqual(['smile', 'smiley', 'sweat_smile']);
  });

  it('falls back to keyword matches', () => {
    const names = searchEmoji(ENTRIES, 'party').map((e) => e.name);
    expect(names).toEqual(['tada']);
  });

  it('is case-insensitive and respects the limit', () => {
    expect(searchEmoji(ENTRIES, 'SMI', 2).map((e) => e.name)).toEqual(['smile', 'smiley']);
  });

  it('returns empty for a no-match query', () => {
    expect(searchEmoji(ENTRIES, 'zzzz')).toEqual([]);
  });
});

describe(loadEmojiIndex, () => {
  it('lazy-loads the real dataset with usable shortnames', async () => {
    const entries = await loadEmojiIndex();
    expect(entries.length).toBeGreaterThan(1000);
    const thumbsup = entries.find((e) => e.name === '+1');
    expect(thumbsup?.char).toBe('👍');
    // every entry is insertable
    expect(entries.every((e) => e.name.length > 0 && e.char.length > 0)).toBe(true);
  });

  it('caches the dataset promise (single fetch per session)', () => {
    expect(loadEmojiIndex()).toBe(loadEmojiIndex());
  });
});

describe('EmojiSuggestion extension', () => {
  it('configures the : trigger on its own plugin key', () => {
    expect(EmojiSuggestion.name).toBe('emojiSuggestion');
    expect(EmojiSuggestion.options.suggestion.char).toBe(':');
    // must not collide with the slash menu's default Suggestion key
    expect(EmojiSuggestion.options.suggestion.pluginKey).toBeDefined();
  });

  it('resolves items through the lazy dataset', async () => {
    const items = await EmojiSuggestion.options.suggestion.items({ query: 'tada' });
    expect(items[0]?.char).toBe('🎉');
  });

  it('insertEmoji replaces the trigger range with the unicode character', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit],
      content: '<p>hello :sm</p>',
    });
    // ":sm" occupies positions 7-10 in <p>hello :sm</p>
    insertEmoji(editor, { from: 7, to: 10 }, '😄');
    expect(editor.getText()).toBe('hello 😄');
    editor.destroy();
  });
});
