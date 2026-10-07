import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SyncModule } from '../sync';
import type { DebugMutationEntry, DebugSubscription, FrappeDebugState, PageIsland } from '../sync/types';
import { Operation, Status } from '../sync/types';

import type { PanelTheme } from './theme';
import { themes } from './theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const fontMono = "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace";
const fontUi = 'system-ui, -apple-system, sans-serif';
const sidebarWidth = 250;
const virtualItemHeight = 28;
const virtualOverscan = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) {
    return 'just now';
  }
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s ago`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function checkpointAge(checkpoint?: string): 'fresh' | 'stale' | 'none' {
  if (!checkpoint) {
    return 'none';
  }
  try {
    const diff = Date.now() - new Date(checkpoint).getTime();
    return diff < 60_000 ? 'fresh' : 'stale';
  } catch {
    return 'none';
  }
}

const opIcons: Record<string, string> = {
  [Operation.Create]: '+',
  [Operation.Update]: '~',
  [Operation.Delete]: '×',
};

// ---------------------------------------------------------------------------
// Virtual scroll hook (simple windowed list)
// ---------------------------------------------------------------------------

function useVirtualScroll(itemCount: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = itemCount * virtualItemHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / virtualItemHeight) - virtualOverscan);
  const visibleCount = Math.ceil(containerHeight / virtualItemHeight) + virtualOverscan * 2;
  const endIdx = Math.min(itemCount, startIdx + visibleCount);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return { startIdx, endIdx, totalHeight, onScroll, offsetY: startIdx * virtualItemHeight };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function Badge({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: fontMono,
        padding: '1px 5px',
        borderRadius: 3,
        backgroundColor: bg,
        color,
        whiteSpace: 'nowrap',
      }}>
      {children}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
  t,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  t: PanelTheme;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: fontUi,
        fontSize: 12,
        padding: '4px 12px',
        border: 'none',
        borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
        background: 'transparent',
        color: active ? t.accent : t.textSecondary,
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  state,
  selected,
  onSelect,
  t,
}: {
  state: FrappeDebugState;
  selected: string | null;
  onSelect: (id: string) => void;
  t: PanelTheme;
}) {
  const ageColor = (age: 'fresh' | 'stale' | 'none') =>
    age === 'fresh' ? t.success : age === 'stale' ? t.warning : t.error;

  return (
    <div
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
      <div
        style={{
          padding: '8px 10px',
          fontFamily: fontUi,
          fontSize: 11,
          fontWeight: 600,
          color: t.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: `1px solid ${t.border}`,
        }}>
        Subscriptions
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {state.subscriptions.length === 0 && (
          <div
            style={{
              padding: '16px 10px',
              fontFamily: fontUi,
              fontSize: 12,
              color: t.textSecondary,
              textAlign: 'center',
            }}>
            No active subscriptions
          </div>
        )}
        {state.subscriptions.map((sub) => {
          const age = checkpointAge(sub.checkpoint);
          const isSelected = selected === sub.id;
          return (
            <div
              key={sub.id}
              onClick={() => {
                onSelect(sub.id);
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                backgroundColor: isSelected ? t.bgHover : 'transparent',
                borderLeft: isSelected ? `3px solid ${t.accent}` : '3px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
              <StatusDot color={ageColor(age)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fontMono,
                    fontSize: 12,
                    color: t.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                  {sub.query.doctype}
                </div>
                <div
                  style={{
                    fontFamily: fontUi,
                    fontSize: 10,
                    color: t.textSecondary,
                  }}>
                  {sub.docCount} docs
                  {sub.tombstoneCount > 0 && ` · ${sub.tombstoneCount} tombstones`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection status */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}>
        <StatusDot color={state.connection.socketConnected ? t.success : t.error} />
        <span style={{ fontFamily: fontUi, fontSize: 10, color: t.textSecondary }}>
          {state.connection.socketConnected ? 'Connected' : 'Disconnected'}
        </span>
        <Badge
          bg={state.connection.isLeader ? `${t.accent}22` : t.bgSubtle}
          color={state.connection.isLeader ? t.accent : t.textSecondary}>
          {state.connection.isLeader ? 'leader' : 'follower'}
        </Badge>
        <StatusDot
          color={state.connection.isOnline ? t.success : t.error}
          size={6}
        />
        <span style={{ fontFamily: fontUi, fontSize: 10, color: t.textSecondary }}>
          {state.connection.isOnline ? 'online' : 'offline'}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Navigator
// ---------------------------------------------------------------------------

function PageNavigator({ sub, syncModule, t }: { sub: DebugSubscription; syncModule: SyncModule; t: PanelTheme }) {
  const { pageInfo } = sub;
  if (!pageInfo) {
    return null;
  }

  const islands = sub.progressiveCache?.islands ?? [];
  const totalPages = pageInfo.totalPages === 'unknown' ? pageInfo.knownPages + 1 : pageInfo.totalPages;
  const maxDisplay = Math.min(totalPages, 50);

  const isPageCached = (page: number): boolean => islands.some((isl) => page >= isl.startPage && page <= isl.endPage);

  const getIslandForPage = (page: number): PageIsland | undefined =>
    islands.find((isl) => page >= isl.startPage && page <= isl.endPage);

  return (
    <div>
      {/* Page info readout */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 8,
          fontFamily: fontMono,
          fontSize: 11,
          color: t.textSecondary,
          flexWrap: 'wrap',
        }}>
        <span>
          page <span style={{ color: t.accent }}>{pageInfo.currentPage}</span>/
          {pageInfo.totalPages === 'unknown' ? '?' : pageInfo.totalPages}
        </span>
        <span>known: {pageInfo.knownPages}</span>
        <span>cached: {pageInfo.itemsInCache}</span>
        <span>size: {pageInfo.pageSize}</span>
        {pageInfo.hasMore && <span style={{ color: t.warning }}>hasMore</span>}
      </div>

      {/* Page strip */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
        {Array.from({ length: maxDisplay }, (_, i) => i + 1).map((page) => {
          const cached = isPageCached(page);
          const isCurrent = page === pageInfo.currentPage;
          const island = getIslandForPage(page);

          return (
            <button
              type="button"
              key={page}
              onClick={async () => await syncModule.getPage(sub.id, page)}
              title={cached ? `Page ${page} · ${island?.fetchedVia ?? 'cached'}` : `Page ${page} · not cached`}
              style={{
                width: 24,
                height: 20,
                fontSize: 9,
                fontFamily: fontMono,
                border: `1px solid ${isCurrent ? t.accent : cached ? t.border : `${t.border}60`}`,
                borderRadius: 3,
                backgroundColor: isCurrent ? t.accent : cached ? t.bgSubtle : 'transparent',
                color: isCurrent ? '#fff' : cached ? t.text : `${t.textSecondary}80`,
                cursor: 'pointer',
                padding: 0,
                lineHeight: '20px',
              }}>
              {page}
            </button>
          );
        })}
        {pageInfo.hasMore && <span style={{ fontFamily: fontMono, fontSize: 11, color: t.textSecondary }}>…</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progressive Cache View
// ---------------------------------------------------------------------------

function ProgressiveCacheView({ sub, t }: { sub: DebugSubscription; t: PanelTheme }) {
  const docIds = sub.progressiveCache?.docIds ?? [];
  const nextCursor = sub.progressiveCache?.nextCursor;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(200);

  useEffect(() => {
    if (containerRef.current) {
      setContainerH(containerRef.current.clientHeight);
    }
  }, []);

  const { startIdx, endIdx, totalHeight, onScroll, offsetY } = useVirtualScroll(docIds.length, containerH);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        maxHeight: 200,
        overflowY: 'auto',
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        fontFamily: fontMono,
        fontSize: 11,
      }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {Array.from({ length: endIdx - startIdx }, (_, i) => {
            const idx = startIdx + i;
            const docId = docIds[idx];
            const isGap = docId === '';
            const isCursor = docId === nextCursor;
            return (
              <div
                key={idx}
                style={{
                  height: virtualItemHeight,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 8px',
                  color: isGap ? `${t.textSecondary}50` : t.text,
                  backgroundColor: isCursor ? `${t.accent}15` : 'transparent',
                  borderLeft: isCursor ? `2px solid ${t.accent}` : '2px solid transparent',
                }}>
                <span style={{ width: 40, color: t.textSecondary, textAlign: 'right' }}>{idx}</span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                  {isGap ? '— gap —' : truncate(docId, 40)}
                </span>
                {isCursor && <span style={{ fontSize: 9, color: t.accent }}>cursor</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages Tab
// ---------------------------------------------------------------------------

function PagesTab({ sub, syncModule, t }: { sub: DebugSubscription; syncModule: SyncModule; t: PanelTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageNavigator
        sub={sub}
        syncModule={syncModule}
        t={t}
      />
      <div>
        <div
          style={{
            fontFamily: fontUi,
            fontSize: 11,
            fontWeight: 600,
            color: t.textSecondary,
            marginBottom: 4,
          }}>
          Progressive Cache ({sub.progressiveCache?.docIds.length ?? 0} entries)
        </div>
        <ProgressiveCacheView
          sub={sub}
          t={t}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cache Tab
// ---------------------------------------------------------------------------

function CacheTab({ state, t }: { state: FrappeDebugState; t: PanelTheme }) {
  const [selectedDoctype, setSelectedDoctype] = useState<string | null>(null);
  const [_expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const { doctypes } = state.normalizedCache;

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%' }}>
      {/* Doctype list */}
      <div
        style={{
          width: 180,
          minWidth: 180,
          borderRight: `1px solid ${t.border}`,
          overflowY: 'auto',
        }}>
        {doctypes.map((dt) => (
          <div
            key={dt.doctype}
            onClick={() => {
              setSelectedDoctype(dt.doctype);
              setExpandedDoc(null);
            }}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              backgroundColor: selectedDoctype === dt.doctype ? t.bgHover : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <span
              style={{
                fontFamily: fontMono,
                fontSize: 11,
                color: t.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
              {dt.doctype}
            </span>
            <Badge
              bg={t.bgSubtle}
              color={t.textSecondary}>
              {dt.count}
            </Badge>
          </div>
        ))}
      </div>

      {/* Document detail (placeholder — full inspection requires cache access) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
        {!selectedDoctype && (
          <div
            style={{
              fontFamily: fontUi,
              fontSize: 12,
              color: t.textSecondary,
              padding: 16,
              textAlign: 'center',
            }}>
            Select a doctype to browse cached documents
          </div>
        )}
        {selectedDoctype && (
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              color: t.text,
              padding: '8px 0',
            }}>
            <div style={{ color: t.textSecondary, marginBottom: 8 }}>
              {selectedDoctype}: {doctypes.find((d) => d.doctype === selectedDoctype)?.count ?? 0} documents in cache
            </div>
            <div style={{ color: t.textSecondary, fontSize: 10 }}>
              Use browser devtools console to inspect individual documents via{' '}
              <span style={{ color: t.accent }}>syncModule.getDocFromCache()</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mutations Tab
// ---------------------------------------------------------------------------

function MutationsTab({ state, t }: { state: FrappeDebugState; t: PanelTheme }) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'failed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const entries: DebugMutationEntry[] = useMemo(() => {
    let list: DebugMutationEntry[] = [];
    if (filter === 'all' || filter === 'pending') {
      list = list.concat(state.mutationJournal.pending);
    }
    if (filter === 'all' || filter === 'confirmed') {
      list = list.concat(state.mutationJournal.confirmed);
    }
    if (filter === 'all' || filter === 'failed') {
      list = list.concat(state.mutationJournal.failed);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [state.mutationJournal, filter]);

  const statusColor = (s: Status) => (s === Status.Pending ? t.pending : s === Status.Confirmed ? t.success : t.error);

  const filters: { key: typeof filter; label: string; count: number }[] = [
    {
      key: 'all',
      label: 'All',
      count:
        state.mutationJournal.pending.length +
        state.mutationJournal.confirmed.length +
        state.mutationJournal.failed.length,
    },
    { key: 'pending', label: 'Pending', count: state.mutationJournal.pending.length },
    { key: 'confirmed', label: 'Confirmed', count: state.mutationJournal.confirmed.length },
    { key: 'failed', label: 'Failed', count: state.mutationJournal.failed.length },
  ];

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {filters.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => {
              setFilter(f.key);
            }}
            style={{
              fontFamily: fontUi,
              fontSize: 11,
              padding: '3px 8px',
              border: `1px solid ${filter === f.key ? t.accent : t.border}`,
              borderRadius: 3,
              backgroundColor: filter === f.key ? `${t.accent}15` : 'transparent',
              color: filter === f.key ? t.accent : t.textSecondary,
              cursor: 'pointer',
            }}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Entries */}
      {entries.length === 0 && (
        <div
          style={{
            fontFamily: fontUi,
            fontSize: 12,
            color: t.textSecondary,
            padding: 16,
            textAlign: 'center',
          }}>
          No mutations
        </div>
      )}
      {entries.map((entry) => {
        const isExpanded = expandedId === entry.id;
        return (
          <div
            key={entry.id}
            style={{
              padding: '4px 8px',
              borderBottom: `1px solid ${t.border}`,
              cursor: entry.error ? 'pointer' : 'default',
            }}
            onClick={() => entry.error && setExpandedId(isExpanded ? null : entry.id)}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: fontMono,
                fontSize: 11,
              }}>
              <span
                style={{
                  width: 14,
                  textAlign: 'center',
                  fontWeight: 700,
                  color:
                    entry.operation === Operation.Create
                      ? t.success
                      : entry.operation === Operation.Delete
                        ? t.error
                        : t.warning,
                }}>
                {opIcons[entry.operation] ?? '?'}
              </span>
              <span style={{ color: t.text }}>{entry.doctype}</span>
              {entry.docname && <span style={{ color: t.textSecondary }}>{truncate(entry.docname, 20)}</span>}
              <span style={{ flex: 1 }} />
              <Badge
                bg={`${statusColor(entry.status)}22`}
                color={statusColor(entry.status)}>
                {entry.status}
              </Badge>
              {entry.retryCount > 0 && (
                <span style={{ fontSize: 10, color: t.textSecondary }}>retry: {entry.retryCount}</span>
              )}
              <span style={{ fontSize: 10, color: t.textSecondary }}>{relativeTime(entry.createdAt)}</span>
            </div>
            {isExpanded && entry.error && (
              <div
                style={{
                  marginTop: 4,
                  padding: '4px 8px',
                  backgroundColor: `${t.error}10`,
                  borderRadius: 3,
                  fontFamily: fontMono,
                  fontSize: 10,
                  color: t.error,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                {entry.error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Bar (Footer)
// ---------------------------------------------------------------------------

function StatsBar({ state, t }: { state: FrappeDebugState; t: PanelTheme }) {
  return (
    <div
      style={{
        padding: '4px 10px',
        borderTop: `1px solid ${t.border}`,
        fontFamily: fontMono,
        fontSize: 10,
        color: t.textSecondary,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
      <span>{state.subscriptions.length} subscriptions</span>
      <span>·</span>
      <span>{state.normalizedCache.size} cached docs</span>
      <span>·</span>
      <span>{state.mutationJournal.pending.length} pending mutations</span>
      <span>·</span>
      <span>{state.connection.isLeader ? 'leader' : 'follower'}</span>
      <span>·</span>
      <span>{state.connection.isOnline ? 'online' : 'offline'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export interface FrappeDevtoolsPanelProps {
  syncModule: SyncModule;
  devtoolsTheme: 'dark' | 'light';
}

const emptyState: FrappeDebugState = {
  subscriptions: [],
  normalizedCache: { size: 0, doctypes: [] },
  mutationJournal: { pending: [], confirmed: [], failed: [] },
  connection: { socketConnected: false, isLeader: false, isOnline: true },
};

export function FrappeDevtoolsPanel({ syncModule, devtoolsTheme }: FrappeDevtoolsPanelProps) {
  const t = themes[devtoolsTheme];
  const [state, setState] = useState<FrappeDebugState>(emptyState);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pages' | 'cache' | 'mutations'>('pages');

  useEffect(() => {
    setState(syncModule.__debug());
    return syncModule.subscribeStore(() => {
      setState(syncModule.__debug());
    });
  }, [syncModule]);

  const selectedSub = useMemo(
    () => state.subscriptions.find((s) => s.id === selectedSubId) ?? null,
    [state.subscriptions, selectedSubId],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: t.bg,
        color: t.text,
        fontFamily: fontUi,
        fontSize: 12,
      }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar
          state={state}
          selected={selectedSubId}
          onSelect={setSelectedSubId}
          t={t}
        />

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: `1px solid ${t.border}`,
              padding: '0 8px',
            }}>
            <TabButton
              active={activeTab === 'pages'}
              onClick={() => {
                setActiveTab('pages');
              }}
              t={t}>
              Pages
            </TabButton>
            <TabButton
              active={activeTab === 'cache'}
              onClick={() => {
                setActiveTab('cache');
              }}
              t={t}>
              Cache
            </TabButton>
            <TabButton
              active={activeTab === 'mutations'}
              onClick={() => {
                setActiveTab('mutations');
              }}
              t={t}>
              Mutations
            </TabButton>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
            {activeTab === 'pages' && selectedSub && (
              <PagesTab
                sub={selectedSub}
                syncModule={syncModule}
                t={t}
              />
            )}
            {activeTab === 'pages' && !selectedSub && (
              <div
                style={{
                  color: t.textSecondary,
                  textAlign: 'center',
                  padding: 32,
                }}>
                Select a subscription from the sidebar to view page state
              </div>
            )}
            {activeTab === 'cache' && (
              <CacheTab
                state={state}
                t={t}
              />
            )}
            {activeTab === 'mutations' && (
              <MutationsTab
                state={state}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer stats bar */}
      <StatsBar
        state={state}
        t={t}
      />
    </div>
  );
}
