import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
/**
 * NotFoundScreen specs (MPO-189) — the unmatched-path surface, mounted over
 * the same fixture shape its stories use.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';

import { NotFoundScreen } from './NotFoundScreen';

const MOCK_HOST = 'https://backoffice-not-found-spec.mock.test';

const renderAt = (path: string, basePath?: string) => {
  const navigation: MemoryNavigator = createMemoryNavigator(path);
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: MOCK_HOST, fixtures: new InMemoryFixtureProvider({}) }}
      navigation={navigation}
      basePath={basePath}>
      <NotFoundScreen />
    </BackofficeProvider>,
  );
  return navigation;
};

describe('<NotFoundScreen />', () => {
  it('names the failed path so a dead deep link is diagnosable', () => {
    renderAt('/backoffice/sales-invoice/SI-0001/edit');
    expect(screen.getByText('Not found')).toBeTruthy();
    expect(screen.getByText('/backoffice/sales-invoice/SI-0001/edit')).toBeTruthy();
  });

  it('REPLACES history with the default workspace, so Back does not bounce', () => {
    const navigation = renderAt('/backoffice/no-such-thing');
    fireEvent.click(screen.getByRole('button', { name: 'Go to workspaces' }));
    expect(navigation.getLocation().path).toBe('/backoffice');
    // replace, not push: going back must not land on the dead address again.
    navigation.back();
    expect(navigation.getLocation().path).toBe('/backoffice');
  });

  it('honors a rebound basePath (mounted at /admin)', () => {
    const navigation = renderAt('/admin/nope', '/admin');
    fireEvent.click(screen.getByRole('button', { name: 'Go to workspaces' }));
    expect(navigation.getLocation().path).toBe('/admin');
  });
});
