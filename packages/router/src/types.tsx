import type { OneRouter } from 'one';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export type Href = OneRouter.Href<{ __branded__: any }>;
export type LoadingState = 'loading' | 'loaded' | 'error';
export type ResultState = 'success' | 'error';
export type RootStateListener = (state: ResultState) => void;
export type LoadingStateListener = (state: LoadingState) => void;

export type InputRouteParamsBlank = OneRouter.InputRouteParamsBlank;
export type InputRouteParams<T extends string> = OneRouter.InputRouteParams<T>;

export interface Router {
  back: () => void;
  canGoBack: () => boolean;
  push: (href: Href) => void;
  navigate: (href: Href) => void;
  replace: (href: Href) => void;
  dismiss: (count?: number) => void;
  dismissAll: () => void;
  canDismiss: () => boolean;
  setParams: <T extends string = ''>(params?: T extends '' ? InputRouteParamsBlank : InputRouteParams<T>) => void;
  subscribe: (listener: RootStateListener) => () => void;
  onLoadState: (listener: LoadingStateListener) => () => void;
}

export type UseRouter = () => Router;
export type UsePathname = () => string;
export type UseParams = () => Record<string, string | string[] | undefined>;

export interface LinkProps {
  href: Href;
  replace?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  [key: string]: any;
}

export interface LinkComponent {
  (props: LinkProps): ReactElement;
  resolveHref: (href: Href) => string;
}
