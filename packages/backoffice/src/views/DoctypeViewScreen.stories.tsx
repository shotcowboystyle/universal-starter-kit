// OWNER: backoffice screens workstream (MPO-189).
// DoctypeViewScreen stories: the alternate-view dispatcher. One arm per
// view, each showing the SHARED ViewHeader (doctype title, the switcher
// across the views that doctype's meta supports, New button) above the view
// body — the composition the individual view stories cannot show, because
// they mount their view without the header.
//
// Everything rides fixtures: getdoctype-shaped meta docs live in the fixture
// provider's "DocType" collection (shared/use-doctype-meta's fixture branch),
// rows and Kanban Board docs in the same InMemoryFixtureProvider. Search-param
// overrides (?board=, ?field=, ?f=) are read from the navigator's location,
// so an arm sets them by seeding the MemoryNavigator path.

import { InMemoryFixtureProvider } from '@repo/frappe';
import { sizeRecipeEscape } from '@repo/theme';
import { YStack } from '@repo/ui';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { BackofficeView } from '../navigation/paths';

import { DoctypeViewScreen } from './DoctypeViewScreen';

const frameHeight = sizeRecipeEscape(600, 'story canvas: a fixed-height frame for a full-height screen to fill');

const meta = {
  title: 'Screens/Backoffice/DoctypeViewScreen',
  component: DoctypeViewScreen,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Dispatches a doctype's alternate views — report, kanban, calendar, tree, image, dashboard — under one shared ViewHeader, and bounces a deep link to /view/list back to the list route. The switcher only offers views the doctype's meta actually supports (view-availability.ts), so a flat doctype never grows a Tree tab. Search-param overrides (?board=, ?field=, ?f=) are read here, never in the leaf views, so each view still mounts standalone.",
      },
    },
  },
};
export default meta;

const MOCK_HOST = 'https://backoffice-doctype-view.mock.test';

// ---------------------------------------------------------------------------
// Fixture metas — one doctype per supported view, mirroring the shapes the
// individual view stories use.
// ---------------------------------------------------------------------------

const TASK_DOCTYPE = 'QaViewTask';
const EVENT_DOCTYPE = 'QaViewEvent';
const NODE_DOCTYPE = 'QaViewNode';
const PHOTO_DOCTYPE = 'QaViewPhoto';

/** Select fields → kanban is supported; report and dashboard always are. */
const taskMeta = {
  name: TASK_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nDone',
      in_list_view: 1,
    },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: 'High\nMedium\nLow',
      in_list_view: 1,
    },
    { fieldname: 'owner_name', fieldtype: 'Data', label: 'Owner', in_list_view: 1 },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

/** Date axes → the calendar picks one; the toolbar selector switches them. */
const eventMeta = {
  name: EVENT_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'title',
  fields: [
    { fieldname: 'title', fieldtype: 'Data', label: 'Title', in_list_view: 1 },
    { fieldname: 'starts_on', fieldtype: 'Datetime', label: 'Starts On' },
    { fieldname: 'ends_on', fieldtype: 'Datetime', label: 'Ends On' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

/** is_tree + the nested-set parent link → the Tree tab appears. */
const nodeMeta = {
  name: NODE_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  is_tree: 1,
  title_field: 'title',
  fields: [
    { fieldname: 'title', fieldtype: 'Data', label: 'Title', in_list_view: 1 },
    {
      fieldname: 'parent_qa_view_node',
      fieldtype: 'Link',
      label: 'Parent Node',
      options: NODE_DOCTYPE,
      hidden: 1,
    },
    { fieldname: 'is_group', fieldtype: 'Check', label: 'Is Group' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

/** image_field → the Image tab appears (a stray Attach Image alone does not). */
const photoMeta = {
  name: PHOTO_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'caption',
  image_field: 'shot',
  fields: [
    { fieldname: 'caption', fieldtype: 'Data', label: 'Caption', in_list_view: 1 },
    { fieldname: 'taken_on', fieldtype: 'Date', label: 'Taken On', in_list_view: 1 },
    { fieldname: 'shot', fieldtype: 'Attach Image', label: 'Shot' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const statuses = ['Open', 'Working', 'Done'];
const priorities = ['High', 'Medium', 'Low'];
const owners = ['ana', 'bo', 'cyrus', 'dee'];

const taskDocs = Array.from({ length: 9 }, (_, i) => ({
  name: `QVT-${String(i + 1).padStart(4, '0')}`,
  doctype: TASK_DOCTYPE,
  subject: `Task ${i + 1}: ${['triage inbox', 'ship release', 'write docs', 'fix flaky test'][i % 4]}`,
  status: statuses[i % statuses.length],
  priority: priorities[i % priorities.length],
  owner_name: owners[i % owners.length],
}));

const eventDocs = Array.from({ length: 6 }, (_, i) => ({
  name: `QVE-${String(i + 1).padStart(4, '0')}`,
  doctype: EVENT_DOCTYPE,
  title: `Event ${i + 1}`,
  starts_on: `2026-09-${String((i % 27) + 1).padStart(2, '0')} 10:00:00`,
  ends_on: `2026-09-${String((i % 27) + 1).padStart(2, '0')} 11:00:00`,
}));

const nodeDocs = [
  { name: 'Root A', doctype: NODE_DOCTYPE, title: 'Root A', parent_qa_view_node: '', is_group: 1 },
  { name: 'Root B', doctype: NODE_DOCTYPE, title: 'Root B', parent_qa_view_node: '', is_group: 1 },
  {
    name: 'A-1',
    doctype: NODE_DOCTYPE,
    title: 'A-1',
    parent_qa_view_node: 'Root A',
    is_group: 0,
  },
  {
    name: 'A-2',
    doctype: NODE_DOCTYPE,
    title: 'A-2',
    parent_qa_view_node: 'Root A',
    is_group: 0,
  },
  {
    name: 'B-1',
    doctype: NODE_DOCTYPE,
    title: 'B-1',
    parent_qa_view_node: 'Root B',
    is_group: 0,
  },
];

const photoDocs = Array.from({ length: 8 }, (_, i) => ({
  name: `QVP-${String(i + 1).padStart(4, '0')}`,
  doctype: PHOTO_DOCTYPE,
  caption: `Frame ${i + 1}`,
  taken_on: `2026-0${(i % 9) + 1}-14`,
  shot: '',
}));

const taskBoard = {
  name: 'QA View Board',
  doctype: 'Kanban Board',
  kanban_board_name: 'QA View Board',
  reference_doctype: TASK_DOCTYPE,
  field_name: 'status',
  columns: [
    { column_name: 'Open', status: 'Active', indicator: 'Blue' },
    { column_name: 'Working', status: 'Active', indicator: 'Orange' },
    { column_name: 'Done', status: 'Active', indicator: 'Green' },
  ],
};

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [taskMeta, eventMeta, nodeMeta, photoMeta],
    'Kanban Board': [taskBoard],
    'Notification Log': [],
    [TASK_DOCTYPE]: taskDocs,
    [EVENT_DOCTYPE]: eventDocs,
    [NODE_DOCTYPE]: nodeDocs,
    [PHOTO_DOCTYPE]: photoDocs,
  });

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const View = ({ doctype, view, path }: { doctype: string; view: BackofficeView; path?: string }) => (
  <BackofficeProvider
    frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
    navigation={createMemoryNavigator(path ?? '/backoffice')}>
    <YStack
      flex={1}
      height={frameHeight}
      minHeight={0}>
      <DoctypeViewScreen
        doctype={doctype}
        view={view}
      />
    </YStack>
  </BackofficeProvider>
);

// ---------------------------------------------------------------------------
// One arm per view
// ---------------------------------------------------------------------------

/** view="report" — the desk-parity report surface under the shared header. */
export const Report = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="report"
  />
);
Report.storyName = 'Main';

/** view="kanban" — the Kanban Board doc drives the columns. */
export const Kanban = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="kanban"
  />
);

/**
 * `?board=` picks a saved board. The dispatcher reads it from the location
 * and hands it down, so KanbanView itself stays param-free.
 */
export const KanbanBoardParam = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="kanban"
    path={`/backoffice/qaviewtask/view/kanban?board=${encodeURIComponent(taskBoard.name)}`}
  />
);

/** view="calendar" — date axes detected from meta; `?field=` overrides. */
export const Calendar = () => (
  <View
    doctype={EVENT_DOCTYPE}
    view="calendar"
  />
);

/** `?field=` pins the calendar's date axis to ends_on instead of starts_on. */
export const CalendarFieldParam = () => (
  <View
    doctype={EVENT_DOCTYPE}
    view="calendar"
    path="/backoffice/qaviewevent/view/calendar?field=ends_on"
  />
);

/** view="tree" — only meta.is_tree doctypes render a forest. */
export const Tree = () => (
  <View
    doctype={NODE_DOCTYPE}
    view="tree"
  />
);

/** view="image" — the card grid over meta.image_field. */
export const Image = () => (
  <View
    doctype={PHOTO_DOCTYPE}
    view="image"
  />
);

/** view="dashboard" — unconditional, offered for every doctype. */
export const Dashboard = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="dashboard"
  />
);

/**
 * A doctype whose meta does NOT support the requested view still renders:
 * the header keeps the current view in the switcher (so the user can see
 * where they are) and the body shows its own unsupported state with a way
 * back to the list. Here: tree on a flat doctype.
 */
export const UnsupportedForDoctype = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="tree"
  />
);

/**
 * view="list" is owned by the list route: the dispatcher REPLACES the
 * location with the list path (Back keeps working) and paints the loading
 * state while it happens.
 */
export const ListRedirect = () => (
  <View
    doctype={TASK_DOCTYPE}
    view="list"
  />
);
