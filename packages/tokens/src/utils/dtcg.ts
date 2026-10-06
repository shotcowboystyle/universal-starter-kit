/**
 * DTCG (Design Tokens Community Group) parsing utilities.
 * Extracts values from DTCG-compliant token structures.
 */

interface DTCGToken<T = string> {
  $value: T;
  $type?: string;
  $description?: string;
}

interface DTCGShadowValue {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

/**
 * DTCG token group with metadata fields and token entries.
 * Metadata fields ($type, $description) are strings, token entries have $value.
 */
type DTCGTokenGroup<T = string> = {
  $type?: string;
  $description?: string;
} & Record<string, DTCGToken<T> | string | undefined>;

/**
 * Strips 'px' suffix and returns numeric value.
 * @param value Dimension string like "16px"
 * @returns Numeric value
 */
const parseDesignTokenDimension = (value: string): number => Number.parseInt(value.replace('px', ''), 10);

/**
 * Type guard to check if value is a DTCG token with $value.
 * @param value Unknown value to check
 * @returns True if value is a DTCG token
 */
const isToken = <T>(value: unknown): value is DTCGToken<T> =>
  typeof value === 'object' && value !== null && '$value' in value;

/**
 * Filters and transforms DTCG token group entries.
 * @param group DTCG token group
 * @param transform Function to transform token value
 * @returns Transformed entries as key-value pairs
 */
const transformTokenGroup = <TIn, TOut>(
  group: DTCGTokenGroup<TIn>,
  transform: (token: DTCGToken<TIn>) => TOut,
): [string, TOut][] =>
  Object.entries(group)
    .filter((entry): entry is [string, DTCGToken<TIn>] => {
      const [key, value] = entry;
      return !key.startsWith('$') && isToken<TIn>(value);
    })
    .map(([key, token]) => [key, transform(token)]);

/**
 * Parses a DTCG dimension token group to numeric values.
 * @param group DTCG token group with $value containing "Npx" strings
 * @returns Object with numeric values keyed by token name
 */
const parseDesignTokenDimensionGroup = (group: DTCGTokenGroup): Record<string, number> =>
  Object.fromEntries(transformTokenGroup(group, (token) => parseDesignTokenDimension(token.$value)));

/**
 * Parses a DTCG color token group to hex strings.
 * @param group DTCG token group with $value containing color strings
 * @returns Object with color values keyed by token name
 */
const parseDesignTokenColorGroup = (group: DTCGTokenGroup): Record<string, string> =>
  Object.fromEntries(transformTokenGroup(group, (token) => token.$value));

/**
 * Parses a DTCG shadow token group to Tamagui-compatible shadow strings.
 * @param group DTCG shadow token group
 * @returns Object with shadow CSS strings
 */
const parseDesignTokenShadowGroup = (group: DTCGTokenGroup<DTCGShadowValue>): Record<string, string> =>
  Object.fromEntries(
    transformTokenGroup(group, (token) => {
      const { offsetX, offsetY, blur, spread, color } = token.$value;
      return `${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
    }),
  );

/**
 * Parses a DTCG fontWeight token group to numeric values.
 * @param group DTCG token group with $value containing weight strings
 * @returns Object with numeric weight values
 */
const parseDesignTokenFontWeightGroup = (group: DTCGTokenGroup): Record<string, number> =>
  Object.fromEntries(transformTokenGroup(group, (token) => Number.parseInt(token.$value, 10)));

/**
 * Parses a DTCG number token group to numeric values.
 * @param group DTCG token group with $value containing number strings
 * @returns Object with numeric values
 */
const parseDesignTokenNumberGroup = (group: DTCGTokenGroup): Record<string, number> =>
  Object.fromEntries(transformTokenGroup(group, (token) => Number.parseFloat(token.$value)));

export {
  parseDesignTokenDimension,
  parseDesignTokenDimensionGroup,
  parseDesignTokenColorGroup,
  parseDesignTokenShadowGroup,
  parseDesignTokenFontWeightGroup,
  parseDesignTokenNumberGroup,
};
