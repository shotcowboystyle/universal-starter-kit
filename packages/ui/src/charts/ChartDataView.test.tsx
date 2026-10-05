import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { XStack, YStack } from 'tamagui';
import { afterEach, expect, it, vi } from 'vitest';

import { ChartCard, KPICard } from '../views/Dashboard';

import { ChartDataView } from './ChartDataView';
import { PieChart } from './PieChart';
import { Sparkline } from './Sparkline';

const data = Array.from({ length: 13 }, (_, index) => ({
  label: `Region ${index + 1}`,
  value: index + 1,
}));
afterEach(cleanup);

it('opens the complete formatted dataset without expanding the concise chart name', async () => {
  renderWithProviders(
    <ChartDataView data={data} title="Revenue" valueFormatter={(value) => `USD ${value}`}>
      {({ action, data: series, valueFormatter }) => (
        <YStack>
          <XStack>{action}</XStack>
          <Sparkline data={series} label="Revenue trend" width={300} valueFormatter={valueFormatter} />
        </YStack>
      )}
    </ChartDataView>,
  );
  const image = document.querySelector('svg')!;
  expect(image.getAttribute('aria-label')).toBe('Revenue trend');
  expect(image.getAttribute('height')).toBe('36');
  expect(image.querySelector('button')).toBeNull();
  expect(screen.queryByText('USD 13')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View data for Revenue' }));
  expect(await screen.findByText('USD 13')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-mpo-chart-data-row]')).toHaveLength(13);
  expect(screen.getByText('Region 13')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });
});

it('normalizes bare sparkline values through the same complete channel', async () => {
  renderWithProviders(
    <ChartDataView data={[40, 50, 60]} title="Activity">
      {({ action, data: series, valueFormatter }) => (
        <YStack>
          {action}
          <Sparkline data={series} width={300} />
        </YStack>
      )}
    </ChartDataView>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'View data for Activity' }));
  expect(await screen.findByText('60')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-mpo-chart-data-row]')).toHaveLength(3);
});

it('supplies a complete data action when the pie legend is hidden', async () => {
  renderWithProviders(<PieChart data={data} title="Revenue" showLegend={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'View data for Revenue' }));
  expect(await screen.findByText('Region 13')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-mpo-chart-data-row]')).toHaveLength(13);
});

it('keeps a visible pie legend complete without a dangling data-action association', () => {
  renderWithProviders(<ChartCard config={{ id: 'revenue', type: 'pie', title: 'Revenue', data }} />);
  expect(screen.getByText('Region 13')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'View data for Revenue' })).toBeNull();
  expect(document.querySelector('svg')!.getAttribute('aria-describedby')).toBeNull();
});

it('keeps a consumer metric press override separate from the data action', async () => {
  const configured = vi.fn();
  const consumer = vi.fn();
  renderWithProviders(
    <KPICard
      config={{
        id: 'metric',
        title: 'Revenue',
        value: 20,
        sparkline: [10, 20],
        onClick: configured,
      }}
      onPress={consumer}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'View data for Revenue' }));
  expect(consumer).not.toHaveBeenCalled();
  expect(configured).not.toHaveBeenCalled();
  expect(await screen.findByText('Revenue: data')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });
  const navigation = document.querySelector('[data-mpo-kpi-navigation="metric"]')!;
  fireEvent.click(navigation);
  fireEvent.keyDown(navigation, { key: 'Enter' });
  fireEvent.keyDown(navigation, { key: ' ', repeat: true });
  expect(consumer).toHaveBeenCalledTimes(2);
  expect(configured).not.toHaveBeenCalled();
});
