import {
  ChartLineUpIcon,
  CurrencyDollarIcon,
  FileTextIcon,
  PercentIcon,
  ShoppingCartIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Dashboard, KPICard, type DashboardWidget } from './Dashboard';

const iconSize = 16;

// Trend color derives from trend × goodDirection —
// each demo metric declares its polarity (undeclared would render neutral).
const widgets: DashboardWidget[] = [
  {
    id: 'kpi-1',
    type: 'kpi',
    kpiConfig: {
      id: 'kpi-1',
      title: 'Total Revenue',
      value: '$12,450',
      previousValue: 11116,
      format: 'currency',
      trend: 'up',
      trendValue: '+12%',
      goodDirection: 'up',
      icon: <CurrencyDollarIcon size={iconSize} />,
      sparkline: [8200, 9100, 8800, 10200, 11100, 12450],
    },
  },
  {
    id: 'kpi-2',
    type: 'kpi',
    kpiConfig: {
      id: 'kpi-2',
      title: 'Active Users',
      value: '1,234',
      trend: 'up',
      trendValue: '+5%',
      goodDirection: 'up',
      icon: <UsersIcon size={iconSize} />,
      sparkline: [980, 1040, 1090, 1120, 1180, 1234],
    },
  },
  {
    id: 'kpi-3',
    type: 'kpi',
    kpiConfig: {
      id: 'kpi-3',
      title: 'Conversion Rate',
      value: '3.2%',
      trend: 'down',
      trendValue: '-0.5%',
      goodDirection: 'up',
      icon: <PercentIcon size={iconSize} />,
      sparkline: [3.8, 3.6, 3.7, 3.5, 3.4, 3.2],
    },
  },
  {
    id: 'kpi-4',
    type: 'progress',
    progressConfig: {
      id: 'kpi-4',
      title: 'Quota filled',
      value: 72,
      max: 100,
      format: 'percent',
    },
  },
  {
    id: 'shortcut-orders',
    type: 'shortcut',
    shortcutConfig: {
      id: 'shortcut-orders',
      title: 'Sales Orders',
      count: 18,
      icon: <ShoppingCartIcon size={iconSize} />,
      onClick: action('shortcut:orders'),
    },
  },
  {
    id: 'shortcut-invoices',
    type: 'shortcut',
    shortcutConfig: {
      id: 'shortcut-invoices',
      title: 'Invoices',
      count: 7,
      icon: <FileTextIcon size={iconSize} />,
      onClick: action('shortcut:invoices'),
    },
  },
  {
    id: 'chart-1',
    type: 'chart',
    colSpan: 2,
    chartConfig: {
      id: 'chart-1',
      title: 'Monthly Revenue',
      type: 'bar',
      data: [
        { label: 'Jan', value: 4000 },
        { label: 'Feb', value: 3000 },
        { label: 'Mar', value: 5000 },
        { label: 'Apr', value: 4500 },
      ],
    },
  },
  {
    id: 'chart-2',
    type: 'chart',
    colSpan: 2,
    chartConfig: {
      id: 'chart-2',
      title: 'Orders over time',
      type: 'line',
      data: [
        { label: 'Jan', value: 42 },
        { label: 'Feb', value: 38 },
        { label: 'Mar', value: 55 },
        { label: 'Apr', value: 49 },
      ],
    },
  },
  {
    id: 'links',
    type: 'list',
    colSpan: 2,
    listConfig: {
      id: 'links',
      title: 'Shortcuts',
      items: [
        { id: 'open', label: 'Open quotations', meta: '12', onClick: action('list:open') },
        { id: 'overdue', label: 'Overdue invoices', meta: '4', onClick: action('list:overdue') },
        { id: 'draft', label: 'Draft orders', meta: '9', onClick: action('list:draft') },
      ],
    },
  },
  {
    id: 'mix',
    type: 'chart',
    colSpan: 2,
    chartConfig: {
      id: 'mix',
      title: 'Revenue mix',
      type: 'pie',
      showLegend: true,
      data: [
        { label: 'Direct', value: 5400 },
        { label: 'Partner', value: 4100 },
        { label: 'Online', value: 2950 },
      ],
    },
  },
];

const meta: Meta = {
  title: 'Components/Dashboard',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const TrendSentiment = {
  render: () => (
    <YStack width="100%" maxWidth={360} gap="$3">
      <KPICard
        config={{
          id: 'improving',
          title: 'Improving revenue',
          value: 120,
          trend: 'up',
          trendValue: '+12%',
          goodDirection: 'up',
        }}
      />
      <KPICard
        config={{
          id: 'worsening',
          title: 'Worsening revenue',
          value: 96,
          trend: 'down',
          trendValue: '-4%',
          goodDirection: 'up',
        }}
      />
      <KPICard
        config={{
          id: 'undeclared',
          title: 'Undeclared sentiment',
          value: 102,
          trend: 'up',
          trendValue: '2%',
        }}
      />
    </YStack>
  ),
};

export const Default = {
  name: 'Main',
  render: () => (
    <Dashboard
      widgets={widgets}
      title="Sales Dashboard"
      description="Number cards, sparklines, gauges, and shortcuts."
    />
  ),
};

/** Initial load with no widgets renders the dashboard skeleton. */
export const Loading = {
  render: () => <Dashboard widgets={[]} title="Sales Dashboard" isLoading />,
};

/** No widgets, no failure — neutral empty state (Axiom 6: empty ≠ error). */
export const Empty = {
  render: () => <Dashboard widgets={[]} title="Sales Dashboard" emptyMessage="No widgets configured" />,
};

/** Failed load — error chrome with retry wins over empty; KPI chrome hides. */
export const Error = {
  render: () => (
    <Dashboard widgets={[]} title="Sales Dashboard" error="Metrics service unavailable." onRetry={action('onRetry')} />
  ),
};

/** Isolated Grafana-stat KPI with nested-scale trend pill and sparkline. */
export const Stat = {
  render: () => (
    <Dashboard
      columns={2}
      title="Stat"
      widgets={[
        {
          id: 'stat',
          type: 'kpi',
          kpiConfig: {
            id: 'stat',
            title: 'Monthly recurring',
            value: 84200,
            format: 'currency',
            previousValue: 79100,
            trend: 'up',
            trendValue: '+6.4%',
            goodDirection: 'up',
            icon: <ChartLineUpIcon size={iconSize} />,
            sparkline: [62, 64, 63, 70, 74, 79, 84],
          },
        },
      ]}
    />
  ),
};
