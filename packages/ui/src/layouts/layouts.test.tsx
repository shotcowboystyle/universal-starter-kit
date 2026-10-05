import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
import * as Debug from './Debug';
import * as EmptyStateModule from './EmptyState';
import { Sidebar, type SidebarSection } from './Sidebar';
import { Tags, type TagItem } from './Tags';
import { Toolbar, type ToolbarAction } from './Toolbar';
import { ViewSwitcher, type ViewOption } from './ViewSwitcher';

import * as Layouts from './index';

// House builder themes for the mark assertion — created at MODULE
// scope: tamagui registers a config's theme variables globally at
// createTamagui time, and a config created after the first render (inside a
// test body) never resolves its tokens (forms Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

afterEach(cleanup);

describe('Layouts Index', () => {
  it('should export everything from Debug', () => {
    for (const key of Object.keys(Debug)) {
      expect(Layouts).toHaveProperty(key);
      expect(Layouts[key as keyof typeof Layouts]).toBe((Debug as Record<string, unknown>)[key]);
    }
  });

  it('should export Sidebar', () => {
    expect(Layouts).toHaveProperty('Sidebar');
  });

  it('should export Toolbar', () => {
    expect(Layouts).toHaveProperty('Toolbar');
  });

  it('should export ViewSwitcher', () => {
    expect(Layouts).toHaveProperty('ViewSwitcher');
  });

  it('should export Breadcrumbs', () => {
    expect(Layouts).toHaveProperty('Breadcrumbs');
  });

  it('should export Attachments', () => {
    expect(Layouts).toHaveProperty('Attachments');
  });

  it('should export Tags', () => {
    expect(Layouts).toHaveProperty('Tags');
  });

  it('should export Timeline', () => {
    expect(Layouts).toHaveProperty('Timeline');
  });

  // The per-component `it`s above are a hand-kept list, and a hand-kept
  // list is how ProgressCard fell off the catalog twice:
  // nobody adds a line for the module they forgot. This walks the directory
  // instead, so a new module in src/layouts that nothing re-exports fails here
  // rather than in a consumer's app.
  //
  // Scope is this directory's own modules: the top-level files, plus each
  // subdirectory's index. A subdirectory's internals stay internal on purpose
  // (SafeAreaWrapper/insets, KeyboardAvoidingWrapper/behavior), and `.native`
  // variants are the same module on a platform this runner is not.
  //
  // Runtime names only — `import * as` cannot see type-only exports, so the
  // interfaces ride the typecheck. That is enough for the failure this guards:
  // a missing VALUE is what breaks a build.
  it('reaches every module under src/layouts from the barrel', () => {
    // Negations live in the GLOB, not in a filter below it: `eager: true`
    // imports every match up front, so a `.stories.tsx` skipped afterwards has
    // already been loaded — and loading one drags the storybook runtime into a
    // vitest environment that has no preview API (measured: "does not provide
    // an export named 'definePreview'", whole suite fails to collect).
    const modules = import.meta.glob<Record<string, unknown>>(
      [
        './*.tsx',
        './*/index.tsx',
        '!./index.tsx',
        '!./*.test.tsx',
        '!./*.stories.tsx',
        '!./**/*.test.tsx',
        '!./**/*.stories.tsx',
      ],
      { eager: true },
    );
    const unreachable: string[] = [];
    for (const [file, mod] of Object.entries(modules)) {
      for (const name of Object.keys(mod)) {
        if (name === 'default') {
          continue;
        }
        if (!(name in Layouts)) {
          unreachable.push(`${file} -> ${name}`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  // The import a consumer actually writes. It passed before EmptyState was
  // named in index.tsx too — page.tsx re-exported it — and this locks the
  // identity, not just the presence, so a future shadow cannot quietly swap it.
  it('exports the same EmptyState from the barrel and from its module', () => {
    expect(Layouts).toHaveProperty('EmptyState');
    expect(Layouts.EmptyState).toBe(EmptyStateModule.EmptyState);
  });
});

// ---------------------------------------------------------------------------
// Test 1: Sidebar renders sections with ListItem
// ---------------------------------------------------------------------------
describe('Sidebar', () => {
  it('renders sections and items as ListItem with title and count', () => {
    const sections: SidebarSection[] = [
      {
        title: 'Navigation',
        items: [
          { label: 'Home', value: 'home', active: true },
          { label: 'Settings', value: 'settings', count: 3 },
        ],
      },
      {
        title: 'Reports',
        items: [{ label: 'Sales', value: 'sales' }],
      },
    ];

    renderWithProviders(<Sidebar sections={sections} />);

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    // Check count is rendered
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Toolbar action anatomy + callbacks
// ---------------------------------------------------------------------------
describe('Toolbar', () => {
  it('renders actions from props and calls action callbacks', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();

    const primaryActions: ToolbarAction[] = [{ label: 'Save', onPress: onSave, variant: 'primary' }];
    const secondaryActions: ToolbarAction[] = [{ label: 'Delete', onPress: onDelete, variant: 'destructive' }];

    renderWithProviders(<Toolbar primaryActions={primaryActions} secondaryActions={secondaryActions} />);

    const saveButton = screen.getByText('Save');
    const deleteButton = screen.getByText('Delete');

    expect(saveButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders independent clusters with gap markers and separates destructive', () => {
    const { container } = renderWithProviders(
      <Toolbar
        primaryActions={[
          { label: 'Save', onPress: () => {}, variant: 'primary' },
          { label: 'Publish', onPress: () => {} },
        ]}
        secondaryActions={[
          { label: 'Discard', onPress: () => {}, variant: 'outlined' },
          { label: 'Delete', onPress: () => {}, variant: 'destructive' },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-toolbar-cluster="independent"]').length).toBe(3);
    expect(container.querySelectorAll('[data-toolbar-cluster="fused"]').length).toBe(0);
    expect(container.querySelector('[data-toolbar-separator="destructive"]')).toBeTruthy();
    expect(container.querySelector('[data-toolbar-region="destructive"]')).toBeTruthy();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('the Surface host clamps toolbar buttons to the small recipe', () => {
    // jsdom cannot cascade Tamagui class CSS — measure via atomic classes
    // (tags-trigger.spec idiom). The toolbar button's height class must
    // match a bare size="$3" Button and differ from the ambient default.
    const classesByPrefix = (el: Element, prefix: string) =>
      String((el as HTMLElement).className || '')
        .split(' ')
        .filter((c) => c.startsWith(prefix))
        .sort();
    const frameOf = (label: HTMLElement) => {
      let el: HTMLElement | null = label.parentElement;
      for (let i = 0; i < 8 && el; i++) {
        if (classesByPrefix(el, '_h-').length > 0) {
          return el;
        }
        el = el.parentElement;
      }
      throw new Error('button frame not found');
    };
    renderWithProviders(
      <>
        <Toolbar primaryActions={[{ label: 'Save', onPress: () => {} }]} />
        <Button size="$3">Small</Button>
        <Button size="$4">Medium</Button>
      </>,
    );
    const toolbarBtn = frameOf(screen.getByText('Save'));
    const small = frameOf(screen.getByText('Small'));
    const medium = frameOf(screen.getByText('Medium'));
    expect(classesByPrefix(toolbarBtn, '_h-')).toEqual(classesByPrefix(small, '_h-'));
    expect(classesByPrefix(toolbarBtn, '_h-')).not.toEqual(classesByPrefix(medium, '_h-'));
  });

  it('fuses consecutive fused actions into a segmented cluster', () => {
    const { container } = renderWithProviders(
      <Toolbar
        primaryActions={[
          { label: 'Day', onPress: () => {}, fused: true },
          { label: 'Week', onPress: () => {}, fused: true },
          { label: 'Refresh', onPress: () => {}, variant: 'outlined' },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-toolbar-cluster="fused"]').length).toBe(1);
    expect(container.querySelectorAll('[data-toolbar-cluster="independent"]').length).toBe(1);
    expect(screen.getByText('Day')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('action label TEXT NODE is weight 400, never 500/600', () => {
    renderWithProviders(<Toolbar primaryActions={[{ label: 'Save', onPress: () => {} }]} />);
    const node = screen.getByText('Save');
    expect(node.tagName).not.toBe('BUTTON');
    expect(node.className).toMatch(/_fow-400\b/);
    expect(node.className).not.toMatch(/_fow-500\b/);
    expect(node.className).not.toMatch(/_fow-600\b/);
  });

  it('explains disabled actions via disabledReason; loading is busy, not bare-disabled', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onPublish = vi.fn();
    renderWithProviders(
      <Toolbar
        primaryActions={[
          {
            label: 'Publish',
            onPress: onPublish,
            disabled: true,
            disabledReason: 'Draft needs a review first',
          },
          { label: 'Sync', onPress: () => {}, loading: true },
        ]}
      />,
    );

    // Reason renders visibly and describes the disabled control.
    expect(screen.getByText('Draft needs a review first')).toBeInTheDocument();
    const publish = screen.getByText('Publish').closest('[role="button"]');
    expect(publish?.getAttribute('aria-disabled')).toBe('true');
    expect(publish?.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(screen.getByText('Publish'));
    expect(onPublish).not.toHaveBeenCalled();

    // Loading action renders the busy spinner (label swapped out) and
    // neither surface emits the bare-disabled warn.
    expect(screen.queryByText('Sync')).not.toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test 3: ViewSwitcher renders as ToggleGroup and calls onViewChange
// ---------------------------------------------------------------------------
describe('ViewSwitcher', () => {
  it('renders view options as ToggleGroup items', () => {
    const onViewChange = vi.fn();

    const views: ViewOption[] = [
      { type: 'list', label: 'List' },
      { type: 'table', label: 'Table' },
      { type: 'kanban', label: 'Kanban' },
    ];

    renderWithProviders(<ViewSwitcher views={views} currentView="list" onViewChange={onViewChange} />);

    // All view labels should be visible as ToggleGroup items
    expect(screen.getByText('List')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
  });

  // One emphasis: the selected chip is an
  // accent-TINTED step (the accent ramp's surface tier — accent11 in a light
  // scheme), never the neutral $color3/$color4 it used to take. Stock test
  // themes carry no accent ramp, so mount the house builder themes.
  it('fills the selected chip with the accent-tinted surface, not a neutral step', () => {
    const tint = houseThemes.light.accent11;
    expect(tint).toBeTruthy();
    // Digit prefix Tamagui embeds in the atomic class for a concrete color.
    const tintDigits = (tint.match(/\d+/g) ?? []).slice(0, 3).join('');

    const views: ViewOption[] = [
      { type: 'list', label: 'List' },
      { type: 'table', label: 'Table' },
    ];
    const { container } = render(
      <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
        <ViewSwitcher views={views} currentView="list" onViewChange={() => {}} />
      </TamaguiProvider>,
    );
    const selected = container.querySelector('[data-state="on"]') as HTMLElement;
    const idle = container.querySelector('[data-state="off"]') as HTMLElement;
    expect(selected).toBeTruthy();
    expect(idle).toBeTruthy();
    expect(selected.className).toContain(`_bg-hsla${tintDigits}`);
    expect(idle.className).not.toContain(`_bg-hsla${tintDigits}`);
  });

  function atoms(el: Element, prefixes: string[]): string[] {
    return String((el as HTMLElement).className || '')
      .split(' ')
      .filter((c) => prefixes.some((p) => c.startsWith(p)))
      .sort();
  }

  it('measures the segment label on the text node — never 500 or 600 (§6.1)', () => {
    const views: ViewOption[] = [
      { type: 'list', label: 'List' },
      { type: 'table', label: 'Table' },
    ];
    renderWithProviders(<ViewSwitcher views={views} currentView="list" onViewChange={() => {}} />);
    const textNode = screen.getByText('List');
    const weight = atoms(textNode, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/500|600|weight-5|weight-6|fow-5|fow-6/);
  });

  it('puts data-testid, data-density and data-size on the root', () => {
    const views: ViewOption[] = [
      { type: 'list', label: 'List' },
      { type: 'table', label: 'Table' },
    ];
    const { container } = renderWithProviders(
      <ViewSwitcher views={views} currentView="list" onViewChange={() => {}} />,
    );
    const root = container.querySelector('[data-testid="view-switcher"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('data-size')).toBeTruthy();
    expect(root.getAttribute('data-density')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Breadcrumbs renders items with theme-aware tokens
// ---------------------------------------------------------------------------
describe('Breadcrumbs', () => {
  it('renders items from props and calls onNavigate', () => {
    const onNavigate = vi.fn();
    const items: BreadcrumbItem[] = [
      { label: 'Home', href: '/' },
      { label: 'Products', href: '/products' },
      { label: 'Widget' },
    ];

    renderWithProviders(<Breadcrumbs items={items} onNavigate={onNavigate} />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    // Separators
    expect(screen.getAllByText('/')).toHaveLength(2);

    // Click a breadcrumb item
    fireEvent.click(screen.getByText('Home'));
    expect(onNavigate).toHaveBeenCalledWith('/');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Tags render with Button chip patterns
// ---------------------------------------------------------------------------
describe('Tags', () => {
  it('renders tag list with chip-styled buttons', () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();

    const tags: TagItem[] = [
      { id: 'tag-1', label: 'urgent' },
      { id: 'tag-2', label: 'important' },
      { id: 'tag-3', label: 'review' },
    ];

    renderWithProviders(<Tags tags={tags} onAdd={onAdd} onRemove={onRemove} />);

    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('important')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 6: Attachments renders items as ListItem with title and subtitle
// ---------------------------------------------------------------------------
describe('Attachments', () => {
  it('renders attachment items with file name and size', () => {
    const { Attachments } = Layouts;
    const items = [
      {
        id: 'file-1',
        fileName: 'report.pdf',
        fileUrl: '/files/report.pdf',
        fileSize: 1024 * 512,
        fileType: 'application/pdf',
      },
      {
        id: 'file-2',
        fileName: 'photo.jpg',
        fileUrl: '/files/photo.jpg',
        fileSize: 1024 * 1024 * 2,
        isImage: true,
      },
    ];

    renderWithProviders(<Attachments items={items} />);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('shows the row-shaped skeleton twin while loading with no items', () => {
    const { Attachments } = Layouts;
    renderWithProviders(<Attachments items={[]} isLoading />);

    expect(document.querySelector('[data-async-skeleton="attachments"]')).toBeTruthy();
    expect(screen.queryByText('No attachments')).toBeNull();
  });

  it('error wins over empty and the retry action fires (Axiom 6)', () => {
    const { Attachments } = Layouts;
    const onRetry = vi.fn();
    renderWithProviders(<Attachments items={[]} error="File list failed to load" onRetry={onRetry} />);

    // Failed load must never masquerade as "no attachments"
    expect(screen.queryByText('No attachments')).toBeNull();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
    expect(screen.getByText('File list failed to load')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the count badge and upload affordance on error', () => {
    const { Attachments } = Layouts;
    renderWithProviders(
      <Attachments items={[]} label="Files" maxAttachments={10} onAdd={() => {}} error="File list failed to load" />,
    );

    expect(screen.queryByText(/\(0\/10\)/)).toBeNull();
    expect(screen.queryByText('Upload')).toBeNull();
  });

  it('Upload label TEXT NODE is weight 400', () => {
    const { Attachments } = Layouts;
    renderWithProviders(<Attachments items={[]} onAdd={() => {}} />);
    const node = screen.getByText('Upload');
    expect(node.tagName).not.toBe('BUTTON');
    expect(node.className).toMatch(/_fow-400\b/);
    expect(node.className).not.toMatch(/_fow-500\b/);
    expect(node.className).not.toMatch(/_fow-600\b/);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Timeline renders entries as ListItem with author and timestamp
// ---------------------------------------------------------------------------
describe('Timeline', () => {
  it('renders timeline entries with author names', () => {
    const { Timeline } = Layouts;
    const entries = [
      {
        id: 'entry-1',
        type: 'comment' as const,
        content: 'Looks good!',
        author: 'Alice',
        timestamp: '2026-01-15T10:00:00Z',
      },
      {
        id: 'entry-2',
        type: 'version' as const,
        author: 'Bob',
        timestamp: '2026-01-15T11:00:00Z',
        changes: [{ field: 'status', old: 'Open', new: 'Closed' }],
      },
    ];

    renderWithProviders(<Timeline entries={entries} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the comment-row skeleton twin while loading with no entries', () => {
    const { Timeline } = Layouts;
    renderWithProviders(<Timeline entries={[]} isLoading />);

    expect(document.querySelector('[data-async-skeleton="timeline"]')).toBeTruthy();
    expect(screen.queryByText('No activity yet')).toBeNull();
  });

  it('error wins over empty and the retry action fires (Axiom 6)', () => {
    const { Timeline } = Layouts;
    const onRetry = vi.fn();
    renderWithProviders(<Timeline entries={[]} error="Activity feed failed to load" onRetry={onRetry} />);

    // Failed load must never masquerade as "no activity"
    expect(screen.queryByText('No activity yet')).toBeNull();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
    expect(screen.getByText('Activity feed failed to load')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the composer and entry count on error', () => {
    const { Timeline } = Layouts;
    const entries = [
      {
        id: 'entry-1',
        type: 'comment' as const,
        content: 'Stale entry',
        author: 'Alice',
        timestamp: '2026-01-15T10:00:00Z',
      },
    ];
    renderWithProviders(
      <Timeline entries={entries} label="Activity" error="Activity feed failed to load" onCommentSubmit={() => {}} />,
    );

    // Composer would invite comments into a feed that failed to load
    expect(screen.queryByLabelText('Add Comment')).toBeNull();
    // Count badge and stale feed rows hide behind the error chrome
    expect(screen.queryByText(/1 entry/)).toBeNull();
    expect(screen.queryByText('Stale entry')).toBeNull();
  });

  it('bidi-isolates the entry-count badge so RTL contexts keep the run in order', () => {
    const { Timeline } = Layouts;
    const entries = [
      {
        id: 'entry-1',
        type: 'comment' as const,
        content: 'First',
        author: 'Alice',
        timestamp: '2026-01-15T10:00:00Z',
      },
      {
        id: 'entry-2',
        type: 'comment' as const,
        content: 'Second',
        author: 'Bob',
        timestamp: '2026-01-15T11:00:00Z',
      },
    ];
    renderWithProviders(<Timeline entries={entries} label="Activity" />);

    // The whole formatted run rides FSI…PDI — under RTL "2 entries" must not
    // reorder to "entries 2" (the measured pre-fix failure).
    expect(screen.getByText('\u20682 entries\u2069')).toBeInTheDocument();
  });
});
