import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

const unwrapChild = (child: ReactNode): ReactNode =>
  isValidElement<{ children?: ReactNode }>(child) && 'children' in child.props ? child.props.children : child;

export const unwrapText = (children: ReactNode): ReactNode[] =>
  // oxlint-disable-next-line react/no-react-children -- toArray flattens fragments/arrays and assigns keys, which unwrapText relies on
  Children.toArray(children).map(unwrapChild);
