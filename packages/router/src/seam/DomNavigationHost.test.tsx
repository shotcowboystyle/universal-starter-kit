import { act, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomNavigationHost } from './DomNavigationHost';
import { stackNavigator } from './navigator';
import { useParams } from './oneAdapter';

const ROUTES = [
  { pattern: '/', tag: 'home', title: 'Home' },
  { pattern: '/todos', tag: 'todos', title: 'Todos' },
  { pattern: '/pokemon/[id]', tag: 'pokemon-detail', title: 'Detail' },
];

function DetailProbe() {
  const params = useParams();
  return <span data-testid="detail-params">{String(params.id ?? '')}</span>;
}

function renderHost(initialHref?: string) {
  stackNavigator.detach();
  stackNavigator.configure(ROUTES);
  return render(
    <DomNavigationHost
      initialHref={initialHref}
      routes={[
        { ...ROUTES[0], element: <div data-testid="home-screen" /> },
        { ...ROUTES[1], element: <div data-testid="todos-screen" /> },
        { ...ROUTES[2], element: <DetailProbe /> },
      ]}
    />,
  );
}

function pageByTag(container: HTMLElement, tag: string): HTMLElement {
  const page = container.querySelector(`[data-seam-page="${tag}"]`);
  expect(page).not.toBeNull();
  return page as HTMLElement;
}

describe('DomNavigationHost', () => {
  beforeEach(() => {
    stackNavigator.detach();
  });

  it('mounts content lazily and keeps backgrounded pages mounted', () => {
    const { container } = renderHost();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    // Unvisited pages are bare shells.
    expect(screen.queryByTestId('todos-screen')).toBeNull();
    expect(pageByTag(container, 'home').dataset.seamActive).toBe('true');

    act(() => {
      stackNavigator.push('/todos');
    });
    expect(screen.getByTestId('todos-screen')).toBeTruthy();
    expect(pageByTag(container, 'todos').dataset.seamActive).toBe('true');
    expect(pageByTag(container, 'home').dataset.seamActive).toBe('false');
    // Backgrounded page keeps its content mounted (One stack semantics).
    expect(screen.getByTestId('home-screen')).toBeTruthy();

    act(() => {
      stackNavigator.back();
    });
    expect(pageByTag(container, 'home').dataset.seamActive).toBe('true');
    expect(screen.getByTestId('todos-screen')).toBeTruthy();
  });

  it('provides per-page params through RouteTagContext', () => {
    renderHost();
    act(() => {
      stackNavigator.push('/pokemon/mew');
    });
    expect(screen.getByTestId('detail-params').textContent).toBe('mew');
  });

  // happy-dom performs no layout, so these assert the STRUCTURE that decides
  // whether the host can be measured at all. An out-of-flow page contributes
  // nothing to its container's intrinsic height, which is what collapsed the
  // host to 0px under an unsized mount node and clipped every page away —
  // with a fully populated DOM, so innerText and toBeVisible() both passed.
  // Real painted heights are measured in a browser (see the seam probe).
  it('keeps the active page in normal flow so an unsized parent still gets height', () => {
    const { container } = renderHost();
    const host = container.firstElementChild as HTMLElement;
    const active = pageByTag(container, 'home');

    expect(active.style.position).toBe('relative');
    expect(active.style.display).toBe('flex');
    expect(active.style.flexGrow).toBe('1');
    expect(active.style.flexBasis).toBe('auto');
    // Fills a definite-height host, scrolls inside it rather than growing it.
    expect(active.style.minHeight).toBe('0');
    expect(active.style.overflow).toBe('auto');
    // ...and the host is the column flex container the page fills.
    expect(host.style.display).toBe('flex');
    expect(host.style.flexDirection).toBe('column');
  });

  it('takes backgrounded pages out of layout entirely', () => {
    const { container } = renderHost();
    act(() => {
      stackNavigator.push('/todos');
    });
    expect(pageByTag(container, 'home').style.display).toBe('none');
    expect(pageByTag(container, 'todos').style.display).toBe('flex');
  });

  it('lets the caller override sizing through style', () => {
    stackNavigator.detach();
    stackNavigator.configure(ROUTES);
    const { container } = render(
      <DomNavigationHost
        style={{ minHeight: 480 }}
        routes={[{ ...ROUTES[0], element: <div data-testid="home-screen" /> }]}
      />,
    );
    expect((container.firstElementChild as HTMLElement).style.minHeight).toBe('480px');
  });

  it('restores an initial route above the root so back affordances survive', () => {
    const { container } = renderHost('/todos');
    expect(pageByTag(container, 'todos').dataset.seamActive).toBe('true');
    // The manifest root stays beneath the restored page (documented replace
    // semantics) — a restored detail page must not dead-end its back button.
    expect(stackNavigator.getSnapshot()).toMatchObject({
      tag: 'todos',
      depth: 2,
      canGoBack: true,
    });
    act(() => {
      stackNavigator.back();
    });
    expect(pageByTag(container, 'home').dataset.seamActive).toBe('true');
  });

  // The root page's content renders BEFORE the attach effect applies
  // initialHref — a restored route's query params must already be seeded by
  // then, or mount-time state seeding (list filters from
  // useLocalSearchParams) reads an empty object and the URL round-trip
  // silently drops the restored filters.
  it("seeds a restored route's params before the first content render", () => {
    const firstRenderParams: Array<Record<string, unknown>> = [];
    function SeedProbe() {
      const params = useParams();
      const first = useRef(true);
      if (first.current) {
        first.current = false;
        firstRenderParams.push({ ...params });
      }
      return <span data-testid="seed-params">{String(params.q ?? '')}</span>;
    }
    stackNavigator.detach();
    stackNavigator.configure(ROUTES);
    render(
      <DomNavigationHost
        initialHref="/?q=fire"
        routes={[
          { ...ROUTES[0], element: <SeedProbe /> },
          { ...ROUTES[1], element: <div data-testid="todos-screen" /> },
          { ...ROUTES[2], element: <DetailProbe /> },
        ]}
      />,
    );
    expect(firstRenderParams[0]).toMatchObject({ q: 'fire' });
    expect(screen.getByTestId('seed-params').textContent).toBe('fire');
  });

  // The warm-deep-link drop: a navigation dispatched from a mounted screen's
  // own effect fires BEFORE the host's attach effect (child effects run
  // first). It must queue and apply, not vanish based on timing.
  it('applies a deep link dispatched from a screen effect before the host attached', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    function RedirectingHome() {
      useEffect(() => {
        stackNavigator.push('/pokemon/pikachu');
      }, []);
      return <div data-testid="home-screen" />;
    }
    stackNavigator.detach();
    stackNavigator.configure(ROUTES);
    const { container } = render(
      <DomNavigationHost
        routes={[
          { ...ROUTES[0], element: <RedirectingHome /> },
          { ...ROUTES[1], element: <div data-testid="todos-screen" /> },
          { ...ROUTES[2], element: <DetailProbe /> },
        ]}
      />,
    );
    expect(pageByTag(container, 'pokemon-detail').dataset.seamActive).toBe('true');
    expect(screen.getByTestId('detail-params').textContent).toBe('pikachu');
    expect(stackNavigator.getSnapshot()).toMatchObject({ depth: 2, canGoBack: true });
    log.mockRestore();
  });

  // StrictMode's mount→unmount→remount opens a detach window; the host must
  // come back attached and both queued and post-mount navigations must land.
  it('survives a StrictMode remount cycle and still navigates', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stackNavigator.detach();
    stackNavigator.configure(ROUTES);
    const { container } = render(
      <StrictMode>
        <DomNavigationHost
          initialHref="/todos"
          routes={[
            { ...ROUTES[0], element: <div data-testid="home-screen" /> },
            { ...ROUTES[1], element: <div data-testid="todos-screen" /> },
            { ...ROUTES[2], element: <DetailProbe /> },
          ]}
        />
      </StrictMode>,
    );
    expect(pageByTag(container, 'todos').dataset.seamActive).toBe('true');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });
    act(() => {
      stackNavigator.push('/pokemon/mew');
    });
    expect(pageByTag(container, 'pokemon-detail').dataset.seamActive).toBe('true');
    expect(screen.getByTestId('detail-params').textContent).toBe('mew');
    log.mockRestore();
  });
});
