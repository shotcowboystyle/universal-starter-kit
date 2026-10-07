import { describe, expect, it } from 'vitest';

import { createMentionExtension } from './mentions';

describe(createMentionExtension, () => {
  it('creates a mention extension with @ as the default trigger', () => {
    const ext = createMentionExtension({ items: () => [] });
    expect(ext.name).toBe('mention');
    expect(ext.options.suggestion.char).toBe('@');
  });

  it('honors a custom trigger', () => {
    const ext = createMentionExtension({ trigger: '#', items: () => [] });
    expect(ext.options.suggestion.char).toBe('#');
  });

  it('maps the forms MentionItem contract (display -> label) and caps at 20', async () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      id: `u${i}`,
      display: `User ${i}`,
      description: `Role ${i}`,
      avatar: `https://a.b/${i}.png`,
    }));
    const ext = createMentionExtension({ items: () => data });
    const items = await ext.options.suggestion.items!({
      query: '',
      editor: null as any,
      signal: new AbortController().signal,
    });
    expect(items).toHaveLength(20);
    expect(items[0]).toEqual({
      id: 'u0',
      label: 'User 0',
      description: 'Role 0',
      avatar: 'https://a.b/0.png',
    });
  });

  it('supports async item sources', async () => {
    const ext = createMentionExtension({
      items: async (query) => [{ id: '1', display: `match:${query}` }],
    });
    const items = await ext.options.suggestion.items!({
      query: 'ada',
      editor: null as any,
      signal: new AbortController().signal,
    });
    expect(items[0]!.label).toBe('match:ada');
  });
});
