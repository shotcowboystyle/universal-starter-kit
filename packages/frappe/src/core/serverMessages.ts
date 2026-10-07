/**
 * Frappe's `_server_messages` is a JSON array of JSON strings, each an object
 * like `{"message": "You don't have access to Report: ToDo", "title": "Message"}`.
 * A message is HTML: inline markup (`<strong>`), `<br>` between sentences, and
 * blocks such as the `<details><summary>` that `is_whitelisted` refuses Guest
 * with. Dropping a block's tags with no boundary glued its summary to its body
 * ("Login to accessFunction …", MPO-473), so a line break or a block edge ends
 * a line here and only inline tags drop.
 */

const lineBoundary =
  /<\s*br\s*\/?\s*>|<\/?\s*(?:p|div|li|ul|ol|summary|details|h[1-6]|tr|table|blockquote|pre)\b[^>]*>/gi;

const entities: readonly (readonly [RegExp, string])[] = [
  [/&nbsp;/g, ' '],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, '&'],
];

/** One server message's HTML as the plain lines it reads as. */
export function serverMessageLines(html: string): string[] {
  let text = html.replace(lineBoundary, '\n').replaceAll(/<[^>]*>/g, '');
  for (const [pattern, value] of entities) {
    text = text.replace(pattern, value);
  }
  return text
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function entryText(entry: unknown): unknown {
  let value = entry;
  if (typeof entry === 'string') {
    try {
      value = JSON.parse(entry);
    } catch {
      return entry;
    }
  }
  if (value && typeof value === 'object') {
    return (value as { message?: unknown }).message;
  }
  return typeof value === 'string' ? value : entry;
}

/**
 * Every message in a `_server_messages` payload, in the server's order, as
 * plain lines: one or more per message, none for an empty one.
 */
export function readServerMessages(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    const text = entryText(entry);
    return typeof text === 'string' ? serverMessageLines(text) : [];
  });
}
