/**
 * Action labels are verb (+ optional noun), sentence case, no articles.
 */

const LEADING_ARTICLE = /^(the|a|an)\s+/i;

export interface ActionLabelParts {
  verb: string;
  noun?: string;
}

function sentenceCaseWord(word: string): string {
  if (!word) {
    return word;
  }
  return word.charAt(0).toLowerCase() + word.slice(1);
}

function normalizePart(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }
  // Drop a leading article if a caller still passed one.
  const withoutArticle = trimmed.replace(LEADING_ARTICLE, '');
  const words = withoutArticle.split(' ').filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  // Sentence case: first word keeps its casing intent from the verb (often Title for
  // single-word UI verbs like "Delete"); subsequent words lowercased unless ALL CAPS
  // / already mixed. We only force the first character of the whole label uppercase.
  const joined = words.map((w, i) => (i === 0 ? w : sentenceCaseWord(w))).join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Build a chrome action label from structured `{ verb, noun? }`.
 *
 * @example formatActionLabel({ verb: "Delete" }) // "Delete"
 * @example formatActionLabel({ verb: "delete", noun: "pipeline" }) // "Delete pipeline"
 * @example formatActionLabel({ verb: "Archive", noun: "the invoice" }) // "Archive invoice"
 */
export function formatActionLabel({ verb, noun }: ActionLabelParts): string {
  const v = normalizePart(verb);
  if (!v) {
    return '';
  }
  if (noun == null || String(noun).trim() === '') {
    return v;
  }
  const n = normalizePart(String(noun));
  if (!n) {
    return v;
  }
  // Noun stays sentence-case continuation (first char lower unless proper-looking).
  const nounTail = n.charAt(0).toLowerCase() + n.slice(1);
  return `${v} ${nounTail}`;
}
