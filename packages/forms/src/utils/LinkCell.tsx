/**
 * LinkCell — renders content as Link when linkResolver returns href, else plain.
 *
 * Used for field-level and ChildTable cell-level link behavior.
 * Forms package uses Link from @repo/router; consumers must provide
 * router context if linkResolver is used.
 */

import { Link } from '@repo/router';
import type { Href } from '@repo/router';
import type { ReactNode } from 'react';

export interface LinkCellFieldProps {
  value: unknown;
  linkResolver: (value: unknown) => Href | null;
  children: ReactNode;
}

/** Field-level: wrap display value in Link when linkResolver returns href. */
export function LinkCell({ value, linkResolver, children }: LinkCellFieldProps): ReactNode {
  let href: Href | null = null;
  try {
    href = linkResolver(value);
  } catch {
    return children;
  }
  if (href != null) {
    return <Link href={href}>{children}</Link>;
  }
  return children;
}
