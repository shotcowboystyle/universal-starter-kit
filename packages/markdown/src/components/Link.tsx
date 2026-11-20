import { openUrl } from '@repo/platform';
import { FOCUS_RING_HALO_OFFSET, useResolvedKnobs } from '@repo/theme';
import { Text, isWeb } from 'tamagui';

import { markdownLinkColors } from '../shared/color-ramps';
import type { LinkProps } from '../types';

const safeProtocols = new Set(['http', 'https', 'mailto', 'tel', 'sms']);
const SCHEME_PATTERN = /^(?<scheme>[a-z][a-z0-9+.-]*):/iu;
const EXTERNAL_PATTERN = /^https?:\/\//iu;

const getSafeHref = (href?: string): string | undefined => {
  if (href === undefined || href === '') {
    return undefined;
  }
  const trimmed = href.trim();
  const scheme = SCHEME_PATTERN.exec(trimmed)?.groups?.scheme;
  // relative, hash, and query hrefs have no scheme and are safe
  if (scheme === undefined) {
    return trimmed;
  }
  return safeProtocols.has(scheme.toLowerCase()) ? trimmed : undefined;
};

export const Link = ({ href, title, children }: LinkProps) => {
  const { knobProps } = useResolvedKnobs();
  const safeHref = getSafeHref(href);
  const hasHref = safeHref !== undefined && safeHref !== '';
  const isExternal = hasHref && EXTERNAL_PATTERN.test(safeHref);

  const handlePress = () => {
    // web navigation is handled natively by the anchor element
    if (!isWeb && hasHref) {
      openUrl(safeHref);
    }
  };

  return (
    <Text
      render="a"
      // @ts-expect-error anchor attributes forwarded to the DOM element
      href={safeHref}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      title={title ?? undefined}
      {...knobProps.body}
      color={markdownLinkColors.text.base}
      textDecorationLine="underline"
      cursor="pointer"
      onPress={handlePress}
      hoverStyle={{ color: markdownLinkColors.text.hover }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineWidth: 2,
        outlineStyle: 'solid',
        // LC-71 §4 halo: inline text link. Offset 0 puts the band across the
        // line box, into the ascenders/descenders of the surrounding prose.
        outlineOffset: FOCUS_RING_HALO_OFFSET,
      }}>
      {children}
    </Text>
  );
};
