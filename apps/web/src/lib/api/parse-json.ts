/**
 * Decodes a JSON string into the caller-declared type T.
 * The backend contract is the only source of T, so the body is not validated at runtime.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T is the caller-declared response type; it cannot be inferred from the text
export const parseJson = <T>(text: string): T => {
  const parsed: unknown = JSON.parse(text);
  // SAFETY: callers declare T to match the endpoint's documented JSON response shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic boundary decode; no runtime schema exists for T
  return parsed as T;
};
