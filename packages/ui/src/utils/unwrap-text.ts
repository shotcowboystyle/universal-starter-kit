import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

export const unwrapText = (children: ReactNode): ReactNode[] => {
  return Children.toArray(children).map((x) => {
    if (isValidElement(x) && x.props && typeof x.props === 'object' && 'children' in x.props) {
      return x.props.children as ReactNode;
    }
    return x;
  });
};
