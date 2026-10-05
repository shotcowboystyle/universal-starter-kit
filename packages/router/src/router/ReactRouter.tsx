import {
  Link as ReactRouterLink,
  useLocation,
  useNavigate,
  useParams as useReactParams,
  useSearchParams as useReactSearchParams,
} from 'react-router-dom';

import type { Href, InputRouteParams, InputRouteParamsBlank, LinkComponent, Router } from '../types';

export const useRouter = (): Router => {
  const location = useLocation();
  const navigate = useNavigate();
  return {
    back: () => navigate(-1),
    canGoBack: () => true,
    push: (href: Href) => navigate(href as string, { replace: false }),
    navigate: (href: Href) => navigate(href as string, { replace: false }),
    replace: (href: Href) => navigate(href as string, { replace: true }),
    dismiss: (count?: number) => navigate(-1 * (count || 1)),
    dismissAll: () => navigate('/'),
    canDismiss: () => true,
    setParams: <T extends string = ''>(params?: T extends '' ? InputRouteParamsBlank : InputRouteParams<T>) => {
      const searchParams = new URLSearchParams(location.search);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            searchParams.delete(key);
          } else {
            searchParams.set(key, String(value));
          }
        });
      }
      navigate({ search: searchParams.toString() });
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

export const usePathname = (): string => useLocation().pathname;

// Combine route params and search params for React Router
export const useParams = () => {
  const routeParams = useReactParams();
  const [searchParams] = useReactSearchParams();
  const params: Record<string, string | string[] | undefined> = {};

  // Add route params
  Object.entries(routeParams).forEach(([key, value]) => {
    if (value !== undefined) {
      params[key] = value;
    }
  });

  // Add search params
  searchParams.forEach((value, key) => {
    if (params[key]) {
      // If key already exists from route params, make it an array
      const existing = params[key];
      params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      params[key] = value;
    }
  });

  return params;
};

export const Link: LinkComponent = ({ href, replace, children, ...props }) => (
  <ReactRouterLink to={href as string} replace={replace} {...props}>
    {children}
  </ReactRouterLink>
);

Link.resolveHref = (href: Href) => href.toString();
