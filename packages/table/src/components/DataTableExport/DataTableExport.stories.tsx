import { action } from '@repo/storybook';
import { Table } from '@repo/table-primitives';
import { formatAbsoluteDate, formatNumber } from '@repo/theme';
import { Card, Text, YStack } from 'tamagui';

import { DataTableExport } from './index';

// Define the data type
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'discontinued';
  createdAt: string;
}

// Sample data
const sampleProducts: Product[] = [
  {
    id: '1',
    name: 'Wireless Headphones',
    category: 'Electronics',
    price: 199.99,
    stock: 45,
    status: 'active',
    createdAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'Ergonomic Chair',
    category: 'Furniture',
    price: 349.99,
    stock: 12,
    status: 'active',
    createdAt: '2024-01-16T14:30:00.000Z',
  },
  {
    id: '3',
    name: 'Coffee Maker',
    category: 'Appliances',
    price: 89.99,
    stock: 28,
    status: 'active',
    createdAt: '2024-01-17T09:15:00.000Z',
  },
  {
    id: '4',
    name: 'Standing Desk',
    category: 'Furniture',
    price: 499.99,
    stock: 8,
    status: 'active',
    createdAt: '2024-01-18T16:45:00.000Z',
  },
  {
    id: '5',
    name: 'Bluetooth Speaker',
    category: 'Electronics',
    price: 79.99,
    stock: 67,
    status: 'discontinued',
    createdAt: '2024-01-19T11:20:00.000Z',
  },
];

// Columns definition
const productColumns = [
  {
    accessorKey: 'name',
    header: 'Product Name',
  },
  {
    accessorKey: 'category',
    header: 'Category',
  },
  {
    accessorKey: 'price',
    header: 'Price',
    cell: (info: any) => `$${info.getValue().toFixed(2)}`,
  },
  {
    accessorKey: 'stock',
    header: 'Stock',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: (info: any) => {
      const status = info.getValue();
      return (
        <Text
          color={status === 'active' ? '$green11' : '$red11'}
          fontWeight="500">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: (info: any) => formatAbsoluteDate(info.getValue()),
  },
];

export default {
  title: 'Table/DataTableExport',
  component: DataTableExport,
  parameters: {
    docs: {
      description: {
        component: 'A comprehensive export component for data tables with multiple format support.',
      },
    },
  },
};

export const Default = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Export Products Data
    </Text>

    <Card
      padding="$4"
      borderRadius="$4">
      <YStack gap="$3">
        <Text
          fontSize="$3"
          fontWeight="500">
          Sample Data Preview:
        </Text>

        <Table>
          <Table.Head>
            <Table.Row>
              {productColumns.map((col) => (
                <Table.HeaderCell key={col.accessorKey}>{col.header}</Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {sampleProducts.slice(0, 3).map((product) => (
              <Table.Row key={product.id}>
                {productColumns.map((col) => (
                  <Table.Cell key={col.accessorKey}>
                    {col.cell
                      ? col.cell({
                          getValue: () => product[col.accessorKey as keyof Product],
                        })
                      : product[col.accessorKey as keyof Product]}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </YStack>
    </Card>

    <DataTableExport
      data={sampleProducts}
      columns={productColumns}
      filename="products-export"
    />

    <Text
      fontSize="$3"
      color="$gray11">
      Click any export button to download the data in different formats.
    </Text>
  </YStack>
);

Default.storyName = 'Main';
export const CustomFormats = () => {
  const customFormats = [
    {
      id: 'csv',
      label: 'CSV',
      icon: null,
      extension: 'csv',
      mimeType: 'text/csv',
      description: 'Comma-separated values',
      enabled: true,
    },
    {
      id: 'json',
      label: 'JSON',
      icon: null,
      extension: 'json',
      mimeType: 'application/json',
      description: 'JavaScript object notation',
      enabled: true,
    },
    {
      id: 'xml',
      label: 'XML',
      icon: null,
      extension: 'xml',
      mimeType: 'application/xml',
      description: 'Extensible markup language',
      enabled: true,
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Custom Export Formats
      </Text>

      <DataTableExport
        data={sampleProducts}
        columns={productColumns}
        exportFormats={customFormats}
        filename="custom-products"
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Only CSV, JSON, and XML formats are enabled in this example.
      </Text>
    </YStack>
  );
};

export const WithExportHandler = () => {
  const handleExport = async (options: any) => {
    action('export-started')(options);

    // Simulate export process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    action('export-completed')(options);
  };

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        With Custom Export Handler
      </Text>

      <DataTableExport
        data={sampleProducts}
        columns={productColumns}
        onExport={handleExport}
        filename="custom-handler-export"
      />

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$blue2">
        <Text
          fontSize="$3"
          color="$blue11">
          This example uses a custom export handler that simulates a longer export process.
        </Text>
      </Card>
    </YStack>
  );
};

export const Disabled = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Disabled Export Component
    </Text>

    <DataTableExport
      data={sampleProducts}
      columns={productColumns}
      disabled
    />

    <Text
      fontSize="$3"
      color="$gray11">
      All export buttons are disabled in this state.
    </Text>
  </YStack>
);

export const EmptyData = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Empty Data Export
    </Text>

    <DataTableExport
      data={[]}
      columns={productColumns}
      filename="empty-export"
    />

    <Text
      fontSize="$3"
      color="$gray11">
      Exporting empty data will create files with just headers (if enabled).
    </Text>
  </YStack>
);

export const LargeDataset = () => {
  // Generate larger dataset
  const largeDataset = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Product ${i + 1}`,
    category: ['Electronics', 'Furniture', 'Appliances', 'Books'][i % 4],
    price: Math.round((Math.random() * 500 + 10) * 100) / 100,
    stock: Math.floor(Math.random() * 100),
    status: Math.random() > 0.1 ? 'active' : 'discontinued',
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Large Dataset Export
      </Text>

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$green2">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$green11">
            Dataset Information:
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            • Total records: {largeDataset.length}
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            • Categories: Electronics, Furniture, Appliances, Books
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            • Price range: $10 - $500
          </Text>
        </YStack>
      </Card>

      <DataTableExport
        data={largeDataset}
        columns={productColumns}
        filename="large-dataset-export"
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Export performance may vary with larger datasets.
      </Text>
    </YStack>
  );
};

export const PrintOnly = () => {
  const printOnlyFormats = [
    {
      id: 'csv',
      label: 'CSV',
      icon: null,
      extension: 'csv',
      mimeType: 'text/csv',
      description: 'CSV format',
      enabled: false, // Disabled
    },
    {
      id: 'excel',
      label: 'Excel',
      icon: null,
      extension: 'xlsx',
      mimeType: 'application/vnd.ms-excel',
      description: 'Excel format',
      enabled: false, // Disabled
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Print-Only Mode
      </Text>

      <DataTableExport
        data={sampleProducts}
        columns={productColumns}
        exportFormats={printOnlyFormats}
        filename="print-only"
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Only the Print functionality is available in this configuration.
      </Text>
    </YStack>
  );
};

export const WithComplexData = () => {
  const complexData = [
    {
      id: '1',
      name: 'Advanced Analytics Dashboard',
      tags: ['analytics', 'dashboard', 'react'],
      metadata: {
        version: '2.1.0',
        author: 'Tech Corp',
        license: 'MIT',
      },
      metrics: {
        users: 15_420,
        sessions: 45_632,
        revenue: 89_234.56,
      },
      features: ['Real-time updates', 'Custom reports', 'API integration'],
      createdAt: '2024-01-15T10:00:00.000Z',
    },
    {
      id: '2',
      name: 'E-commerce Platform',
      tags: ['ecommerce', 'payment', 'inventory'],
      metadata: {
        version: '3.0.1',
        author: 'Commerce Inc',
        license: 'Apache 2.0',
      },
      metrics: {
        users: 89_234,
        sessions: 234_567,
        revenue: 1_456_789.23,
      },
      features: ['Payment processing', 'Inventory management', 'Order tracking'],
      createdAt: '2024-01-16T14:30:00.000Z',
    },
  ];

  const complexColumns = [
    {
      accessorKey: 'name',
      header: 'Project Name',
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: (info: any) => info.getValue().join(', '),
    },
    {
      accessorKey: 'metadata',
      header: 'Version',
      cell: (info: any) => info.getValue().version,
    },
    {
      accessorKey: 'metrics',
      header: 'Users',
      cell: (info: any) => formatNumber(info.getValue().users),
    },
    {
      accessorKey: 'features',
      header: 'Features Count',
      cell: (info: any) => info.getValue().length,
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Complex Data Export
      </Text>

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$purple2">
        <Text
          fontSize="$3"
          color="$purple11">
          This example demonstrates exporting data with nested objects and arrays.
        </Text>
      </Card>

      <DataTableExport
        data={complexData}
        columns={complexColumns}
        filename="complex-data-export"
      />
    </YStack>
  );
};
