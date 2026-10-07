import { sizeRecipeForToken } from '@repo/theme';

/** Control-internal glyphs (LC-75/LC-79): recipe icon channel, no handwritten px. */
export function iconSizeForToken(token: string): number {
  return sizeRecipeForToken(token).iconSize;
}
