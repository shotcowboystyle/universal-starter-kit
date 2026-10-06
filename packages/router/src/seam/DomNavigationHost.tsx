// DOM navigation host — renders the route manifest as a stack of DOM
// pages, one per route, driving the same seam the GTK host drives.
//
// The DOM equivalent of the GTK navigation host: every route
// gets a permanent page wrapper (so the host stack and the seam mirror
// stay aligned), the page's React CONTENT mounts on the route's first
// visit (stackNavigator.isVisited) and stays mounted from then on —
// backgrounded pages keep their state, the same lifecycle One gives stack
// screens on web/native. Only the top-of-stack page is visible; the rest
// are display:none.
//
// Usage (mirrors the GTK entries):
//
//   stackNavigator.configure(ROUTES);            // before render
//   <DomNavigationHost
//     routes={ROUTES.map((r) => ({ ...r, element: <Screen /> }))}
//     initialHref={restoredRoute}                // optional state restore
//   />
//
// Stack state flows host → seam: every adapter mutation calls
// stackNavigator.syncFromHost(), exactly like the GTK pushed/popped/
// replaced signal handlers.
//
// Sizing needs no ceremony: the host fills a parent with a definite height
// and otherwise sizes to the active page (`style` overrides either way).
// See the contract above PAGE_STYLE.

import type { CSSProperties, ReactNode } from 'react';
import { Suspense, useEffect, useRef } from 'react';

import { RouteTagContext, stackNavigator, useNavState } from './navigator';
import type { Href, NavStackAdapter, RouteDef } from './navigator';

/** In-memory implementation of the host-stack protocol (the seam's
 *  NavStackAdapter mirrors Adw.NavigationView's method surface — see
 *  navigator.ts). */
// oxlint-disable-next-line react-doctor/only-export-components -- adapter and host are one unit; tests and entries import both from this module
export class DomStackAdapter implements NavStackAdapter {
  private stack: string[];
  private readonly onChanged: () => void;

  constructor(rootTag: string, onChanged: () => void) {
    this.stack = rootTag ? [rootTag] : [];
    this.onChanged = onChanged;
  }

  // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
  push_by_tag(tag: string): void {
    this.stack.push(tag);
    this.onChanged();
  }

  pop(): boolean {
    if (this.stack.length <= 1) {
      return false;
    }
    this.stack.pop();
    this.onChanged();
    return true;
  }

  // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
  pop_to_tag(tag: string): boolean {
    const idx = this.stack.lastIndexOf(tag);
    if (idx === -1 || idx === this.stack.length - 1) {
      return false;
    }
    this.stack = this.stack.slice(0, idx + 1);
    this.onChanged();
    return true;
  }

  // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
  replace_with_tags(tags: string[]): void {
    this.stack = [...tags];
    this.onChanged();
  }

  // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
  get_navigation_stack(): ReturnType<NavStackAdapter['get_navigation_stack']> {
    const snapshot = this.stack;
    return {
      // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
      get_n_items: () => snapshot.length,
      // oxlint-disable-next-line sonarjs/function-name -- mirrors the Adw.NavigationView method name that NavStackAdapter requires
      get_item: (index: number) => {
        if (index < 0 || index >= snapshot.length) {
          return null;
        }
        // oxlint-disable-next-line sonarjs/function-name -- mirrors Adw.NavigationPage.get_tag
        return { get_tag: () => snapshot[index] ?? null };
      },
    };
  }
}

export interface DomRouteEntry extends RouteDef {
  element: ReactNode;
}

export interface DomNavigationHostProps {
  routes: DomRouteEntry[];
  /** Restore a previous route on mount (e.g. from vscode.getState()) —
   *  applied as a replace ABOVE the manifest root (see the replace
   *  semantics in navigator.ts), so a restored detail page keeps a working
   *  back affordance to the root instead of dead-ending. */
  initialHref?: Href;
  style?: CSSProperties;
}

// Sizing contract — the host fills a definite-height parent and falls back
// to its content's height when the parent is indefinite.
//
// The active page is a NORMAL-FLOW flex child, not `position: absolute;
// inset: 0`. Out-of-flow pages contribute nothing to the container's
// intrinsic height, so a host under an unsized mount node (a webext popup's
// `#app`, say) collapsed to 0 and clipped every page away — a fully
// populated DOM painting zero pixels, which neither innerText assertions nor
// Playwright's toBeVisible() can see. In flow, `height: 100%` degrades to
// `auto` and the container sizes to the page instead of to nothing.
//
// Only the top-of-stack page is displayed, so nothing needs to overlay:
// backgrounded pages are `display: none` and leave layout entirely.
// `position: relative` stays so screens keep the page as their containing
// block, and `minHeight: 0` + `overflow: auto` keep a too-tall page
// scrolling INSIDE a definite-height host rather than growing it.
const PAGE_STYLE: CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
};

const noop = (): void => {
  // intentionally empty
};

/** Dev-only: a host that measures 0px tall paints nothing, however healthy
 *  its DOM looks. Say so instead of shipping a blank surface. */
const useZeroHeightWarning = (ref: { current: HTMLDivElement | null }): void => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return noop;
    }
    const el = ref.current;
    if (!el) {
      return noop;
    }
    // A frame late: parents that size themselves in their own effect (or on
    // font load) have landed by then.
    const raf = requestAnimationFrame(() => {
      // offsetParent === null ⇒ legitimately hidden (collapsed panel, an
      // ancestor with display:none), not a sizing bug.
      if (el.offsetParent === null || el.getBoundingClientRect().height > 0) {
        return;
      }
      if (process.env.NODE_ENV === 'production') {
        return;
      }
      console.error(
        '[stack nav] DomNavigationHost rendered 0px tall — every page is clipped and ' +
          'this surface paints nothing. Give the mount node a definite height (e.g. ' +
          '`#app { display: flex; flex-direction: column; min-height: 100vh }`) or pass ' +
          '`style={{ minHeight: … }}` to the host.',
      );
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [ref]);
};

export const DomNavigationHost = ({ routes, initialHref, style }: DomNavigationHostProps): ReactNode => {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<DomStackAdapter | null>(null);
  if (adapterRef.current === null) {
    // First-render lazy init. Seeding the initial route's params here (not
    // in the attach effect, which runs AFTER page content rendered once)
    // lets a restored route's query params reach mount-time state seeding —
    // e.g. a root list initializing its filters from useLocalSearchParams.
    if (initialHref !== undefined) {
      stackNavigator.seedInitialRoute(initialHref);
    }
    adapterRef.current = new DomStackAdapter(routes[0]?.tag ?? '', () => {
      stackNavigator.syncFromHost();
    });
  }
  // Mount-time value only — reattaching on href identity changes would
  // reset the live stack.
  const initialHrefRef = useRef(initialHref);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return noop;
    }
    // initialHref rides attach() so the restore lands BEFORE queued deep
    // links flush — a navigation that arrived while unattached (child
    // effects, remount gaps) is fresher intent and must end up on top.
    stackNavigator.attach(adapter, { initialHref: initialHrefRef.current });
    return () => {
      stackNavigator.detach();
    };
  }, []);

  useZeroHeightWarning(hostRef);

  const nav = useNavState();

  return (
    <div
      ref={hostRef}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        ...style,
      }}>
      {routes.map((route) => {
        const active = nav.tag === route.tag;
        const mounted = stackNavigator.isVisited(route.tag);
        return (
          <div
            key={route.tag}
            data-seam-page={route.tag}
            data-seam-active={active ? 'true' : 'false'}
            style={{ ...PAGE_STYLE, display: active ? 'flex' : 'none' }}>
            <RouteTagContext.Provider value={route.tag}>
              <Suspense fallback={null}>{mounted ? route.element : null}</Suspense>
            </RouteTagContext.Provider>
          </div>
        );
      })}
    </div>
  );
};
