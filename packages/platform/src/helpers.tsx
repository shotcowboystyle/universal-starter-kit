import type { Attributes, ComponentType } from 'react';

const isPerformanceNow = typeof performance !== 'undefined' && 'now' in performance;
const date = isPerformanceNow ? performance : Date;
let _previousUnique: number;

export const fastUnique = () => {
  let unique = date.now();
  while (unique === _previousUnique) {
    unique = date.now();
  }
  _previousUnique = unique;
  if (isPerformanceNow) {
    return Date.now() + unique.toString();
  }
  return unique.toString();
};

const REACT_ELEMENT_KEYS = ['_owner', '_store', 'key', 'props', 'ref', 'type'] as const;

const isString = (value: unknown): value is string => typeof value === 'string';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSX children are arbitrary
export const isText = (children: unknown) => {
  if (Array.isArray(children)) {
    return children.length > 1 && isString(children[0]) && REACT_ELEMENT_KEYS.every((key) => key in children[1]);
  }
  return isString(children);
};

const flattenLayouts = <Props,>(layout: ComponentType<Props>, [...layouts]: WithLayout[]): ComponentType<Props> => {
  const currentLayout = layouts.pop();
  if (!currentLayout) {
    return layout;
  }
  return flattenLayouts(currentLayout(layout), layouts);
};

export const createWithLayout = <LayoutProps,>(
  Layout: ComponentType<LayoutProps>,
  extraLayouts: WithLayout[] = [],
  layoutProps?: Omit<LayoutProps, 'children'>,
): WithLayout => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: children are supplied by JSX below, so layoutProps (Omit<LayoutProps, 'children'>) completes LayoutProps
  const fullLayoutProps = layoutProps as LayoutProps;
  const withLayout: WithLayout = (Component) =>
    flattenLayouts((props) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Attributes only adds an optional `key`, which these forwarded props never carry
      const componentProps = props as Attributes & typeof props;
      return (
        <Layout {...fullLayoutProps}>
          <Component {...componentProps} />
        </Layout>
      );
    }, extraLayouts);
  return withLayout;
};

export type WithLayout = <Props>(Component: ComponentType<Props>) => ComponentType<Props>;

export const isDev = process.env.NODE_ENV === 'development' || (typeof __DEV__ !== 'undefined' && __DEV__);
