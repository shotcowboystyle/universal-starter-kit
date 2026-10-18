import { hasField, isObject, isString } from '../util';

/**
 * Frappe's `_server_messages` is a JSON array of JSON strings, each an object
 * like `{"message": "You don't have access to Report: Sales Invoice", "title": "Message"}`.
 * A message is HTML: inline markup (`<strong>`), `<br>` between sentences, and
 * blocks such as the `<details><summary>` that `is_whitelisted` refuses Guest
 * with. Dropping a block's tags with no boundary glued its summary to its body
 * ("Login to accessFunction …", MPO-473), so a line break or a block edge ends
 * a line here and only inline tags drop.
 */

const lineBoundary =
  // oxlint-disable-next-line sonarjs/super-linear-regex -- input is one short server-rendered message, never user-sized
  /<\s*br\s*\/?\s*>|<\/?\s*(?:p|div|li|ul|ol|summary|details|h[1-6]|tr|table|blockquote|pre)\b[^>]*>/giu;

const entities: readonly (readonly [RegExp, string])[] = [
  [/&nbsp;/gu, ' '],
  [/&lt;/gu, '<'],
  [/&gt;/gu, '>'],
  [/&quot;/gu, '"'],
  [/&#39;/gu, "'"],
  [/&amp;/gu, '&'],
];

/** One server message's HTML as the plain lines it reads as. */
export const serverMessageLines = (html: string): string[] => {
  // oxlint-disable-next-line sonarjs/super-linear-regex -- input is one short server-rendered message, never user-sized
  let text = html.replace(lineBoundary, '\n').replaceAll(/<[^>]*>/gu, '');
  for (const [pattern, value] of entities) {
    text = text.replace(pattern, value);
  }
  return text
    .split('\n')
    .map((line) => line.replaceAll(/\s+/gu, ' ').trim())
    .filter(Boolean);
};

/** The message text of one `_server_messages` entry: a JSON string, a bare string, or an object. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- an element of the raw `_server_messages` array; this is its parser
const entryText = (entry: unknown): string | undefined => {
  let value = entry;
  if (isString(entry)) {
    try {
      value = JSON.parse(entry);
    } catch {
      // Not JSON: the entry is the message itself.
      return entry;
    }
  }
  if (hasField(value, 'message')) {
    return isString(value.message) ? value.message : undefined;
  }
  if (isObject(value)) {
    return undefined;
  }
  if (isString(value)) {
    return value;
  }
  return isString(entry) ? entry : undefined;
};

/**
 * Every message in a `_server_messages` payload, in the server's order, as
 * plain lines: one or more per message, none for an empty one.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw `_server_messages` field of a response body; this is its parser
export const readServerMessages = (raw: unknown): string[] => {
  if (!isString(raw) || raw.trim() === '') {
    return [];
  }
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    // Malformed `_server_messages` carries no readable message.
    return [];
  }
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    const text = entryText(entry);
    return text === undefined ? [] : serverMessageLines(text);
  });
};
