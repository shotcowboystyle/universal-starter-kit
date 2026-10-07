/**
 * DeskSurface — the target→surface switch plus the surface override
 * registry (MPO-14 / gaps GL-1 assembly half + GL-6, spec 09 §3, §5.1).
 *
 * A pure dispatch: every branch renders an EXISTING wired component; no
 * fetch, no filter construction, no visual values (DK-2/DK-3). Overrides
 * ride props (per-Desk by construction, DK-7): per-doctype first, then
 * per-kind, then the built-in.
 */
import { Spinner, YStack } from '@repo/ui';
import { useMemo } from 'react';
import type { ComponentType } from 'react';

import { setCreatePrefill } from '../form/createPrefill';
import { DocFormScreen } from '../form/DocFormScreen';
import { DoctypeListScreen } from '../list/DoctypeListScreen';
import type { BackofficeView } from '../navigation/paths';
import { QueryReportScreen } from '../report/QueryReportScreen';
import type { FrappeFilters } from '../shared/types';
import { HomeRedirect } from '../shell/HomeRedirect';
import { NotFoundScreen } from '../shell/NotFoundScreen';
import { DoctypeViewScreen } from '../views/DoctypeViewScreen';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

import type { DeskTarget } from './target';

export type DeskSurfaceKind = DeskTarget['kind'];

/** The whole contract an override receives — thin enough to wrap the built-in. */
export interface DeskSurfaceProps {
  target: DeskTarget;
  readOnly?: boolean;
}

/** A component per kind, or per doctype under that kind. */
export type DeskSurfaceOverride = ComponentType<DeskSurfaceProps> | Record<string, ComponentType<DeskSurfaceProps>>;

export type DeskSurfaceOverrides = Partial<Record<DeskSurfaceKind, DeskSurfaceOverride>>;

function resolveOverride(
  overrides: DeskSurfaceOverrides | undefined,
  target: DeskTarget,
): ComponentType<DeskSurfaceProps> | undefined {
  const entry = overrides?.[target.kind];
  if (!entry) {
    return undefined;
  }
  if (typeof entry === 'function') {
    return entry;
  }
  const doctype = 'doctype' in target ? target.doctype : undefined;
  return doctype ? entry[doctype] : undefined;
}

/** Create mode, `?d=`/pin defaults routed through the ONE prefill stash. */
function NewDocSurface({
  doctype,
  defaults,
  readOnly,
}: {
  doctype: string;
  defaults?: Record<string, unknown>;
  readOnly?: boolean;
}) {
  const defaultsKey = JSON.stringify(defaults ?? null);
  // Stash in a memo (not an effect) so the values land before
  // DocFormScreen's create-mode seeding runs — same contract as the old
  // host route screen this replaces.
  useMemo(() => {
    if (defaults && Object.keys(defaults).length > 0) {
      setCreatePrefill(doctype, defaults);
    }
    // oxlint-disable-next-line exhaustive-deps
  }, [doctype, defaultsKey]);
  // Keyed on defaults: same-doctype navigation with different `?d=` must
  // remount to re-seed.
  return (
    <DocFormScreen
      key={defaultsKey}
      doctype={doctype}
      name="new"
      readOnly={readOnly}
    />
  );
}

export interface DeskSurfaceHostProps extends DeskSurfaceProps {
  overrides?: DeskSurfaceOverrides;
  /** Seed for the list surface's user-editable filter channel. */
  initialFilters?: FrappeFilters;
  /** View-switcher allowlist forwarded to the list surface. */
  views?: readonly BackofficeView[];
}

export function DeskSurface({ target, overrides, readOnly, initialFilters, views }: DeskSurfaceHostProps) {
  const Override = resolveOverride(overrides, target);
  if (Override) {
    return (
      <Override
        target={target}
        readOnly={readOnly}
      />
    );
  }

  switch (target.kind) {
    case 'home': {
      return <HomeRedirect />;
    }
    case 'workspace': {
      return <WorkspaceScreen workspace={target.workspace} />;
    }
    case 'list': {
      return (
        <DoctypeListScreen
          doctype={target.doctype}
          filtersParam={target.filtersParam}
          sortParam={target.sortParam}
          initialFilters={initialFilters}
          views={views}
        />
      );
    }
    case 'view': {
      return (
        <DoctypeViewScreen
          doctype={target.doctype}
          view={target.view}
        />
      );
    }
    case 'new': {
      return (
        <NewDocSurface
          doctype={target.doctype}
          defaults={target.defaults}
          readOnly={readOnly}
        />
      );
    }
    case 'form': {
      // DocFormScreen is desk chrome over FrappeForm (MPO-15): the fields
      // are the exported FrappeForm's, on the controller useFrappeForm
      // returns, so this branch and a bare <FrappeForm> resolve a doctype
      // the same way.
      return (
        <DocFormScreen
          doctype={target.doctype}
          name={target.name}
          readOnly={readOnly}
        />
      );
    }
    case 'report': {
      return <QueryReportScreen reportName={target.reportName} />;
    }
    case 'not-found': {
      return <NotFoundScreen />;
    }
  }
}

/** The resolving state — same presentation as the slug route's spinner. */
export function DeskSurfaceLoading() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center">
      <Spinner size="large" />
    </YStack>
  );
}
