import React from 'react';

import type { SyncModule } from '../sync';

import { FrappeDevtoolsPanel } from './FrappeDevtoolsPanel';

export const frappeDevtoolsPlugin = (syncModule: SyncModule) => ({
  id: 'frappe',
  name: 'Frappe',
  render: (_el: HTMLElement, props: { theme: 'dark' | 'light' }) => (
    <FrappeDevtoolsPanel
      syncModule={syncModule}
      devtoolsTheme={props.theme}
    />
  ),
});
