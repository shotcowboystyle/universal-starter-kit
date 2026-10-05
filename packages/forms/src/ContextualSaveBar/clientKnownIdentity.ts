/**
 * CLIENT-KNOWN-IDENTITY — post-mutation navigation rides an identifier
 * the client already owns. A missing / blank / literal `"undefined"` value
 * is an honest refuse, never interpolated into a route.
 */
export function clientKnownIdentity(id: unknown): string {
  if (typeof id !== 'string') {
    throw new Error('LC-64: post-mutation navigation requires a client-known identity');
  }
  const trimmed = id.trim();
  if (!trimmed || trimmed === 'undefined') {
    throw new Error('LC-64: post-mutation navigation requires a client-known identity');
  }
  return trimmed;
}
