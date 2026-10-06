/**
 * Is a theme value one a renderer can actually resolve?
 *
 * `composeGetTheme` drops nullish consumer entries so a partial override does
 * not erase a framework derivation. It did nothing else, so a consumer
 * `getTheme` that returned a MISSPELLED colour handed the string straight to
 * paint: `borderColor: "vaR(--x)"` is not nullish, survives the merge, reaches
 * CSS, resolves to nothing, and the element falls back to `currentColor`.
 * That is the same near-black-border failure `composeGetTheme` guards against, only
 * with a slower fuse — it surfaces in someone's browser rather than in a build.
 *
 * So: validate at build. The predicate is deliberately PERMISSIVE. A false
 * negative here fails an app's whole theme construction, which is far worse
 * than the paint bug it prevents, so anything CSS could plausibly resolve
 * passes and only the clearly-unresolvable fails.
 */

/** Tamagui resolves a `$`-prefixed value against the token table, not CSS. */
const TOKEN_REFERENCE = /^\$[\w.-]+$/;

/** #rgb, #rgba, #rrggbb, #rrggbbaa. */
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Every CSS colour FUNCTION, plus `var()`. Only the head is checked: the
 * argument grammar is CSS's job and re-implementing it here would be a second
 * parser to keep in step with the spec.
 */
const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(/;

/** CSS-wide keywords plus the two the theme layer actually writes. */
const KEYWORDS = new Set([
  'transparent',
  'currentColor',
  'currentcolor',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
  'none',
]);

/**
 * The 148 CSS named colours. Spelled out rather than matched with `/^[a-z]+$/`
 * on purpose: a bare-word pattern accepts `reddish` and `bakcground`, which are
 * exactly the typos this check exists to catch.
 */
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

/**
 * True when a renderer can resolve `value` to a colour.
 *
 * Numbers pass: a theme carries numeric values (z-index, opacity-ish steps)
 * that are not colours at all and are not this check's business.
 */
export function isResolvableThemeValue(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const text = value.trim();
  if (text === '') {
    return false;
  }
  if (TOKEN_REFERENCE.test(text)) {
    return true;
  }
  if (HEX.test(text)) {
    return true;
  }
  if (COLOR_FUNCTION.test(text)) {
    return true;
  }
  if (KEYWORDS.has(text)) {
    return true;
  }
  return NAMED_COLORS.has(text.toLowerCase());
}

/**
 * Throw on the first unresolvable entry, naming the theme, the key and the
 * value. The message has to carry all three: a `getTheme` runs once per theme
 * name, so "bad value" alone leaves the author grepping.
 */
export function assertResolvableThemeValues(entries: Record<string, unknown>, themeName: string): void {
  for (const [key, value] of Object.entries(entries)) {
    if (value == null) {
      continue;
    }
    if (isResolvableThemeValue(value)) {
      continue;
    }
    throw new Error(
      `getTheme returned an unresolvable value for "${key}" in theme "${themeName}": ` +
        `${JSON.stringify(value)}. A theme value must be a $token, a hex colour, a CSS ` +
        `colour function, a CSS-wide keyword or a named colour — anything else resolves to ` +
        `nothing at paint and the element falls back to currentColor (10 B.3 item 3, MPO-23).`,
    );
  }
}
