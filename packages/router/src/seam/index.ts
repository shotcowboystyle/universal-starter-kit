// Stack-navigation seam — One router semantics over host-native stacks
// (Adw.NavigationView on GTK, DOM pages in VS Code webviews / webext
// views). See navigator.ts for the design notes.
//
// Deliberately NOT re-exported from the package root: the root barrel is
// consumed by One/native builds where the seam is never the router;
// targets import `@repo/router/seam` (or alias `one` to
// ./oneAdapter) explicitly.

export {
  RouteTagContext,
  StackNavigator,
  hrefToString,
  stackNavigator,
  useNavState,
  useRouteParams,
} from './navigator';
export type {
  Href,
  NavParams,
  NavSnapshot,
  NavStackAdapter,
  RouteDef,
  RouteLoader,
  RouteLoaderProps,
} from './navigator';
export { DomNavigationHost, DomStackAdapter } from './DomNavigationHost';
export type { DomNavigationHostProps, DomRouteEntry } from './DomNavigationHost';
export {
  Link,
  LoadProgressBar,
  Slot,
  useBlocker,
  useLoader,
  useLocalSearchParams,
  useMatches,
  useParams,
  usePathname,
  useRouter,
} from './oneAdapter';
export type { LinkProps, LoaderProps } from './oneAdapter';
