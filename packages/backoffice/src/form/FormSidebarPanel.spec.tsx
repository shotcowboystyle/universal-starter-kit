import { Accordion } from '@repo/ui';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SidebarAccordionTrigger } from './FormSidebarPanel';

afterEach(cleanup);

const section = (key: string, title: string) => ({
  key,
  title,
  count: 0,
  icon: null,
  content: null,
});

describe('SidebarAccordionTrigger stacked-group radius (LC-72)', () => {
  it('marks Assigned To first, Tags middle, Liked By last', () => {
    renderWithProviders(
      <Accordion
        type="multiple"
        variant="plain">
        <Accordion.Item
          value="assigned"
          borderBottomWidth={0}>
          <SidebarAccordionTrigger
            section={section('assigned', 'Assigned To')}
            index={0}
            count={5}
            open={false}
          />
        </Accordion.Item>
        <Accordion.Item
          value="tags"
          borderBottomWidth={0}>
          <SidebarAccordionTrigger
            section={section('tags', 'Tags')}
            index={2}
            count={5}
            open={false}
          />
        </Accordion.Item>
        <Accordion.Item
          value="liked"
          borderBottomWidth={0}>
          <SidebarAccordionTrigger
            section={section('liked', 'Liked By')}
            index={4}
            count={5}
            open={false}
          />
        </Accordion.Item>
      </Accordion>,
    );
    expect(screen.getByTestId('form-sidebar-section-assigned').dataset.groupPosition).toBe('first');
    expect(screen.getByTestId('form-sidebar-section-tags').dataset.groupPosition).toBe('middle');
    expect(screen.getByTestId('form-sidebar-section-liked').dataset.groupPosition).toBe('last');
  });
});
