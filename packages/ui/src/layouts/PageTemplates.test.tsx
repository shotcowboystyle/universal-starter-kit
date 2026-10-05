import { renderWithProviders } from '@repo/test-utils';
import { layoutBreakpoints } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { Button, Paragraph } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { CONTENT_MAX_WIDTH, PageSection, Screen } from './Page';
import { DetailPageLayout, ListPageLayout, SettingsPageLayout } from './PageTemplates';

import * as Layouts from './index';

afterEach(cleanup);

describe('layouts index exports (W11 templates)', () => {
  it('exports page templates + content max-width token', () => {
    expect(Layouts.ListPageLayout).toBe(ListPageLayout);
    expect(Layouts.DetailPageLayout).toBe(DetailPageLayout);
    expect(Layouts.SettingsPageLayout).toBe(SettingsPageLayout);
    expect(Layouts.CONTENT_MAX_WIDTH).toBe(CONTENT_MAX_WIDTH);
  });
});

describe('Screen content max-width', () => {
  it('CONTENT_MAX_WIDTH is the canonical xl breakpoint', () => {
    expect(CONTENT_MAX_WIDTH).toBe(layoutBreakpoints.xl);
    expect(CONTENT_MAX_WIDTH).toBe(1280);
  });

  it('Screen defaults its content cap to CONTENT_MAX_WIDTH', () => {
    renderWithProviders(
      <Screen data-testid="screen-shell">
        <Paragraph>Body</Paragraph>
      </Screen>,
    );
    expect(screen.getByTestId('screen-shell')).toHaveStyle({
      maxWidth: `${CONTENT_MAX_WIDTH}px`,
    });
  });
});

describe('ListPageLayout', () => {
  it('renders header, toolbar slot, and flex content region', () => {
    renderWithProviders(
      <ListPageLayout
        title="Pokemon"
        subtitle="All records"
        actions={<Button>New</Button>}
        toolbar={<Paragraph>Filters</Paragraph>}>
        <Paragraph>Rows</Paragraph>
      </ListPageLayout>,
    );
    expect(screen.getByText('Pokemon')).toBeInTheDocument();
    expect(screen.getByText('All records')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByTestId('list-page-content')).toHaveTextContent('Rows');
  });
});

describe('DetailPageLayout', () => {
  it('shows main + aside side-by-side from expanded up (supporting pane)', () => {
    renderWithProviders(
      <DetailPageLayout sizeClass="expanded" title="Bulbasaur" aside={<Paragraph>Meta</Paragraph>}>
        <Paragraph>Main</Paragraph>
      </DetailPageLayout>,
    );
    const pane = screen.getByTestId('pane-scaffold');
    expect(pane).toHaveAttribute('data-panes', '2');
    expect(pane).toHaveAttribute('data-canonical', 'supporting-pane');
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('stacks the aside below main content on compact (never hidden)', () => {
    renderWithProviders(
      <DetailPageLayout sizeClass="compact" title="Bulbasaur" aside={<Paragraph>Meta</Paragraph>}>
        <Paragraph>Main</Paragraph>
      </DetailPageLayout>,
    );
    expect(screen.queryByTestId('pane-scaffold')).not.toBeInTheDocument();
    const stack = screen.getByTestId('detail-page-stack');
    expect(stack).toHaveTextContent('Main');
    expect(stack).toHaveTextContent('Meta');
  });

  it('renders toolbar leading/trailing slots', () => {
    renderWithProviders(
      <DetailPageLayout
        sizeClass="compact"
        toolbarLeading={<Button>Back</Button>}
        toolbarTrailing={<Button>Edit</Button>}>
        <Paragraph>Main</Paragraph>
      </DetailPageLayout>,
    );
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders children directly when no aside is given', () => {
    renderWithProviders(
      <DetailPageLayout sizeClass="xl" title="Bulbasaur">
        <Paragraph>Main only</Paragraph>
      </DetailPageLayout>,
    );
    expect(screen.queryByTestId('pane-scaffold')).not.toBeInTheDocument();
    expect(screen.getByText('Main only')).toBeInTheDocument();
  });
});

describe('SettingsPageLayout', () => {
  it('caps content at the expanded breakpoint by default', () => {
    renderWithProviders(
      <SettingsPageLayout title="Settings" data-testid="settings-shell">
        <PageSection title="Profile">
          <Paragraph>Fields</Paragraph>
        </PageSection>
      </SettingsPageLayout>,
    );
    expect(screen.getByTestId('settings-shell')).toHaveStyle({
      maxWidth: `${layoutBreakpoints.expanded}px`,
    });
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Fields')).toBeInTheDocument();
  });

  it('honors a caller max-width override', () => {
    renderWithProviders(
      <SettingsPageLayout maxWidth={layoutBreakpoints.large} data-testid="settings-shell">
        <Paragraph>Fields</Paragraph>
      </SettingsPageLayout>,
    );
    expect(screen.getByTestId('settings-shell')).toHaveStyle({
      maxWidth: `${layoutBreakpoints.large}px`,
    });
  });
});
