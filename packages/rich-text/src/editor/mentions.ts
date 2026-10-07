/**
 * @ mention support for the rich text editor (web).
 *
 * Reuses the forms `MentionItem` contract (LC-16: same suggestion data
 * shape as `MentionInput`) and the shared suggestion popup (same rows,
 * chrome, and keyboard handling as the slash menu). The host wires data via
 * the `mentions` prop -- the package assumes no backend.
 *
 * Inserted mentions are Tiptap mention nodes rendered as
 * `<span data-type="mention" data-id="...">@label</span>` chips.
 */

import Mention from '@tiptap/extension-mention';

import { t } from '../shared/t';
import type { RichTextMentionOptions } from '../types';

import { createSuggestionRenderer, getSuggestionChrome } from './suggestionPopup';

export type { RichTextMentionOptions };

/** Internal suggestion payload: Mention's default command reads id + label */
interface MentionSuggestionItem {
  id: string;
  label: string;
  description?: string;
  avatar?: string;
}

export function createMentionExtension(options: RichTextMentionOptions) {
  return Mention.configure({
    HTMLAttributes: { class: 'rt-mention' },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: options.trigger ?? '@',
      items: async ({ query }: { query: string }): Promise<MentionSuggestionItem[]> => {
        const items = await options.items(query);
        return items.slice(0, 20).map((item) => ({
          id: item.id,
          label: item.display,
          description: item.description,
          avatar: item.avatar,
        }));
      },
      render: createSuggestionRenderer<MentionSuggestionItem>({
        toRow: (item) => ({
          key: item.id,
          title: item.label,
          description: item.description,
          avatarUrl: item.avatar,
        }),
        getChrome: getSuggestionChrome,
        getEmptyLabel: () => t('No results'),
      }),
    },
  });
}
