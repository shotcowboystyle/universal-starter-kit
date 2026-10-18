// Contract: alternate doctype views (report, kanban, calendar, tree, image,
// dashboard) dispatched by `view`. Every view shares the ViewHeader (title,
// view switcher across all backoffice views, New button) and honest
// loading / error / unsupported states with a way back to the list.
//
// Search-param overrides (desk parity):
//   ?board=<Kanban Board name>  — kanban board selection
//   ?field=<fieldname>          — calendar date field
//   ?f=<urlencoded JSON>        — report base filters
// Search params are read HERE (via the navigator's subscribable location),
// never in the leaf view screens, so each view can mount outside a One
// navigation container (stories/tests).
import { YStack } from '@repo/ui';
import { useEffect } from 'react';

import { useBackofficeLocation, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import type { BackofficeView } from '../navigation/paths';
// Report workstream: view=report mounts the desk-parity report surface from
// report/ (default columns, per-column filter row, saved reports). The old
// views/ReportView stays exported for compatibility.
import { DoctypeReportView as ReportView } from '../report/DoctypeReportView';

import { CalendarView } from './CalendarView';
import { DashboardView } from './DashboardView';
import { ImageView } from './ImageView';
import { KanbanView } from './KanbanView';
import { TreeView } from './TreeView';
import { ViewHeader } from './ViewHeader';
import { ViewLoading } from './ViewStates';

export interface DoctypeViewScreenProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
  view: BackofficeView;
}

/**
 * "list" is owned by the list route (/backoffice/[slug]) — a deep link to
 * /view/list bounces there. `replace` keeps Back working (the /view/list
 * URL never enters history); the effect is client-only so SSR just paints
 * the loading state.
 */
const ListRedirect = ({ doctype }: { doctype: string }) => {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  useEffect(() => {
    navigator.replace(paths.list(doctype));
  }, [navigator, paths, doctype]);
  return <ViewLoading />;
};

const ViewBody = ({ doctype, view }: { doctype: string; view: Exclude<BackofficeView, 'list'> }) => {
  const { params } = useBackofficeLocation();
  const board = Array.isArray(params.board) ? undefined : params.board;
  const field = Array.isArray(params.field) ? undefined : params.field;
  const filtersParam = Array.isArray(params.f) ? params.f[0] : params.f;

  switch (view) {
    case 'report': {
      return (
        <ReportView
          doctype={doctype}
          filtersParam={filtersParam}
        />
      );
    }
    case 'kanban': {
      return (
        <KanbanView
          doctype={doctype}
          board={board}
        />
      );
    }
    case 'calendar': {
      return (
        <CalendarView
          doctype={doctype}
          dateField={field}
        />
      );
    }
    case 'tree': {
      return <TreeView doctype={doctype} />;
    }
    case 'image': {
      return <ImageView doctype={doctype} />;
    }
    case 'dashboard': {
      return <DashboardView doctype={doctype} />;
    }
    default: {
      return null;
    }
  }
};

export const DoctypeViewScreen = ({ doctype, view }: DoctypeViewScreenProps) => {
  if (view === 'list') {
    return <ListRedirect doctype={doctype} />;
  }
  return (
    <YStack flex={1}>
      <ViewHeader
        doctype={doctype}
        view={view}
      />
      <YStack
        flex={1}
        minHeight={0}>
        <ViewBody
          doctype={doctype}
          view={view}
        />
      </YStack>
    </YStack>
  );
};
