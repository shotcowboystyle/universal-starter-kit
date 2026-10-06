import { hrefToString } from '../types';
import type { Href, LinkComponent, Router } from '../types';

// Storybook/test stub router: navigation is a no-op (a logger here would recurse into itself).
const noop = (): void => {
  // intentionally empty
};

const log = (..._args: unknown[]): void => {
  // intentionally empty
};

export const useRouter = (): Router => ({
  back: () => {
    log('back()');
  },
  canGoBack: () => false,
  push: (href: Href) => {
    log('push', hrefToString(href));
  },
  navigate: (href: Href) => {
    log('navigate', hrefToString(href));
  },
  replace: (href: Href) => {
    log('replace', hrefToString(href));
  },
  dismiss: (count?: number) => {
    log('dismiss', count ?? 1);
  },
  dismissAll: () => {
    log('dismissAll()');
  },
  canDismiss: () => false,
  setParams: (params) => {
    log('setParams', params);
  },
  subscribe: (listener) => {
    listener('success');
    return noop;
  },
  onLoadState: (listener) => {
    listener('loaded');
    return noop;
  },
});

export const usePathname = (): string => '/';

export const useParams = () => ({});

export const Link: LinkComponent = ({ href, replace, children, ...props }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    log(replace ? 'replace' : 'push', hrefToString(href));
  };
  return (
    <a
      href={hrefToString(href)}
      onClick={handleClick}
      {...props}>
      {children}
    </a>
  );
};

Link.resolveHref = hrefToString;

export const useUrlState = <T extends object>(
  defaultValues: T,
): [T, (newState: Partial<T> | ((prev: T) => Partial<T>)) => void] => [defaultValues, noop];
