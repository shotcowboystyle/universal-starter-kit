import type { Href, LinkComponent, Router } from '../types';

// Storybook/test stub router: navigation is a no-op (a logger here would recurse into itself).
const log = (..._args: unknown[]) => {};

export const useRouter = (): Router => {
  return {
    back: () => {
      log('back()');
    },
    canGoBack: () => false,
    push: (href: Href) => {
      log('push', String(href));
    },
    navigate: (href: Href) => {
      log('navigate', String(href));
    },
    replace: (href: Href) => {
      log('replace', String(href));
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
      return () => {};
    },
    onLoadState: (listener) => {
      listener('loaded');
      return () => {};
    },
  };
};

export const usePathname = (): string => '/';

export const useParams = () => ({});

export const Link: LinkComponent = ({ href, replace, children, ...props }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    log(replace ? 'replace' : 'push', String(href));
  };
  return (
    <a href={href as string} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};

Link.resolveHref = (href: Href) => href.toString();

export function useUrlState<T extends Record<string, any>>(
  defaultValues: T,
): [T, (newState: Partial<T> | ((prev: T) => Partial<T>)) => void] {
  const setState = () => {};
  return [defaultValues, setState];
}
