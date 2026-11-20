/**
 * Ambient declaration for the emojilib v2 dataset JSON, imported directly
 * (subpath) so the lazy emoji chunk skips index.js and ordered.json.
 */
declare module 'emojilib/emojis.json' {
  const lib: Record<
    string,
    {
      keywords?: string[];
      char?: string;
      fitzpatrick_scale?: boolean;
      category?: string;
    }
  >;
  export default lib;
}
