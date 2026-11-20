/**
 * CLIENT-KNOWN-IDENTITY — post-mutation navigation rides an identifier
 * the client already owns. A missing / blank / literal `"undefined"` value
 * is an honest refuse, never interpolated into a route.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the parse boundary: it accepts whatever the mutation envelope carried and refuses anything that is not a usable id
export const clientKnownIdentity = (id?: unknown): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the parse step of this boundary
  if (typeof id !== 'string') {
    throw new TypeError('LC-64: post-mutation navigation requires a client-known identity');
  }
  const trimmed = id.trim();
  if (!trimmed || trimmed === 'undefined') {
    throw new Error('LC-64: post-mutation navigation requires a client-known identity');
  }
  return trimmed;
};
