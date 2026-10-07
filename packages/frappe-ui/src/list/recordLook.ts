/**
 * How a doctype's records present beyond their fields: a display title, a
 * short code beside it, candidate images. Lists, insights and record pages
 * draw a record the same way from one declaration.
 */
export interface FrappeRecordLook<TDoc> {
  /** The record's display name; defaults to the title field, then the name. */
  title?: (doc: Partial<TDoc>) => string;
  /** A short code shown beside the title ("#025"). */
  code?: (doc: Partial<TDoc>) => string;
  /** A muted line under the title on cards (a Pokemon's species). */
  subtitle?: (doc: Partial<TDoc>) => string | undefined;
  /** Image candidates in order; a failed load moves to the next. */
  images?: (doc: Partial<TDoc>, baseURL: string | undefined) => string[];
  /** Further images a record page shows after the first, one slide each. */
  gallery?: (doc: Partial<TDoc>, baseURL: string | undefined) => FrappeRecordSlide[];
}

export interface FrappeRecordSlide {
  src: string;
  label: string;
  /** Nearest-neighbor upscaling, for pixel art. */
  pixelated?: boolean;
}

export function recordTitle<TDoc>(
  doc: Partial<TDoc>,
  look: FrappeRecordLook<TDoc> | undefined,
  titleField?: string,
): string {
  const custom = look?.title?.(doc);
  if (custom) {
    return custom;
  }
  const row = doc as Record<string, unknown>;
  const field = titleField ? row[titleField] : undefined;
  if (typeof field === 'string' && field) {
    return field;
  }
  return typeof row.name === 'string' ? row.name : '';
}
