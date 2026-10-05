import { Children, isValidElement, type ReactNode } from 'react';

export function unwrapText(children: ReactNode): ReactNode[] {
  return Children.toArray(children).map((x) => {
    if (isValidElement(x) && x.props && typeof x.props === 'object' && 'children' in x.props) {
      return x.props.children as ReactNode;
    }
    return x;
  });
}
