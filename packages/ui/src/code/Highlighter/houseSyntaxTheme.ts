/**
 * The house shiki theme: github-light's scope rules one for one,
 * each painted with a theme token in the rich-text editor's roles, so code
 * ink follows the scheme and tint and holds `holdSyntaxFloor`'s 4.5:1. Shiki
 * passes a non-hex colour through untouched (a placeholder while tokenizing,
 * restored on every token), which is what lets a theme name Tamagui tokens.
 */

export interface HouseSyntaxThemeSetting {
  scope?: string | string[];
  settings: { foreground?: string; background?: string; fontStyle?: string };
}

export interface HouseSyntaxTheme {
  name: string;
  fg: string;
  bg: string;
  settings: HouseSyntaxThemeSetting[];
}

const ink = {
  plain: '$color12',
  muted: '$color11',
  keyword: '$syntaxPurple',
  name: '$syntaxBlue',
  constant: '$syntaxBlue',
  builtin: '$syntaxOrange',
  variable: '$syntaxOrange',
  string: '$syntaxGreen',
  tag: '$syntaxGreen',
  inserted: '$syntaxGreen',
  deleted: '$syntaxRed',
} as const;

export const houseSyntaxTheme: HouseSyntaxTheme = {
  name: 'house',
  fg: ink.plain,
  bg: '$color3',
  settings: [
    { settings: { foreground: ink.plain, background: '$color3' } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: ink.muted },
    },
    {
      scope: [
        'constant',
        'entity.name.constant',
        'variable.other.constant',
        'variable.other.enummember',
        'variable.language',
      ],
      settings: { foreground: ink.constant },
    },
    { scope: ['entity', 'entity.name'], settings: { foreground: ink.name } },
    { scope: 'variable.parameter.function', settings: { foreground: ink.plain } },
    { scope: 'entity.name.tag', settings: { foreground: ink.tag } },
    { scope: 'keyword', settings: { foreground: ink.keyword } },
    { scope: ['storage', 'storage.type'], settings: { foreground: ink.keyword } },
    {
      scope: ['storage.modifier.package', 'storage.modifier.import', 'storage.type.java'],
      settings: { foreground: ink.plain },
    },
    {
      scope: ['string', 'punctuation.definition.string', 'string punctuation.section.embedded source'],
      settings: { foreground: ink.string },
    },
    { scope: 'support', settings: { foreground: ink.builtin } },
    { scope: 'meta.property-name', settings: { foreground: ink.constant } },
    { scope: 'variable', settings: { foreground: ink.variable } },
    { scope: 'variable.other', settings: { foreground: ink.plain } },
    { scope: 'invalid.broken', settings: { foreground: ink.deleted, fontStyle: 'italic' } },
    { scope: 'invalid.deprecated', settings: { foreground: ink.deleted, fontStyle: 'italic' } },
    { scope: 'invalid.illegal', settings: { foreground: ink.deleted, fontStyle: 'italic' } },
    { scope: 'invalid.unimplemented', settings: { foreground: ink.deleted, fontStyle: 'italic' } },
    {
      scope: 'carriage-return',
      settings: { foreground: ink.deleted, fontStyle: 'italic underline' },
    },
    { scope: 'message.error', settings: { foreground: ink.deleted } },
    { scope: 'string variable', settings: { foreground: ink.variable } },
    { scope: ['source.regexp', 'string.regexp'], settings: { foreground: ink.string } },
    {
      scope: [
        'string.regexp.character-class',
        'string.regexp constant.character.escape',
        'string.regexp source.ruby.embedded',
        'string.regexp string.regexp.arbitrary-repitition',
      ],
      settings: { foreground: ink.string },
    },
    {
      scope: 'string.regexp constant.character.escape',
      settings: { foreground: ink.string, fontStyle: 'bold' },
    },
    { scope: 'support.constant', settings: { foreground: ink.builtin } },
    { scope: 'support.variable', settings: { foreground: ink.builtin } },
    { scope: 'meta.module-reference', settings: { foreground: ink.constant } },
    {
      scope: 'punctuation.definition.list.begin.markdown',
      settings: { foreground: ink.variable },
    },
    {
      scope: ['markup.heading', 'markup.heading entity.name'],
      settings: { foreground: ink.name, fontStyle: 'bold' },
    },
    { scope: 'markup.quote', settings: { foreground: ink.muted } },
    { scope: 'markup.italic', settings: { foreground: ink.plain, fontStyle: 'italic' } },
    { scope: 'markup.bold', settings: { foreground: ink.plain, fontStyle: 'bold' } },
    { scope: ['markup.underline'], settings: { fontStyle: 'underline' } },
    { scope: ['markup.strikethrough'], settings: { fontStyle: 'strikethrough' } },
    { scope: 'markup.inline.raw', settings: { foreground: ink.constant } },
    {
      scope: ['markup.deleted', 'meta.diff.header.from-file', 'punctuation.definition.deleted'],
      settings: { foreground: ink.deleted },
    },
    {
      scope: ['markup.inserted', 'meta.diff.header.to-file', 'punctuation.definition.inserted'],
      settings: { foreground: ink.inserted },
    },
    {
      scope: ['markup.changed', 'punctuation.definition.changed'],
      settings: { foreground: ink.variable },
    },
    { scope: ['markup.ignored', 'markup.untracked'], settings: { foreground: ink.constant } },
    { scope: 'meta.diff.range', settings: { foreground: ink.keyword, fontStyle: 'bold' } },
    { scope: 'meta.diff.header', settings: { foreground: ink.constant } },
    { scope: 'meta.separator', settings: { foreground: ink.constant, fontStyle: 'bold' } },
    { scope: 'meta.output', settings: { foreground: ink.constant } },
    {
      scope: [
        'brackethighlighter.tag',
        'brackethighlighter.curly',
        'brackethighlighter.round',
        'brackethighlighter.square',
        'brackethighlighter.angle',
        'brackethighlighter.quote',
      ],
      settings: { foreground: ink.muted },
    },
    { scope: 'brackethighlighter.unmatched', settings: { foreground: ink.deleted } },
    {
      scope: ['constant.other.reference.link', 'string.other.link'],
      settings: { foreground: ink.string, fontStyle: 'underline' },
    },
  ],
};
