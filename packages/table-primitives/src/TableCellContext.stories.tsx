import { SizableText, XStack, YStack } from 'tamagui';

import { Table, useIsInTableCell, useTableCellContext } from './index';

export default {
  title: 'Table/TableCellContext',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'TableCellContext is true inside Table.Cell / Table.HeaderCell (with isHeader on the header) and false outside. Forms use it to drop chrome.',
      },
    },
  },
};

function Probe({ label }: { label: string }) {
  const inCell = useIsInTableCell();
  const ctx = useTableCellContext();
  return (
    <SizableText
      testID={`cell-ctx-${label}`}
      {...({
        'data-in-cell': String(inCell),
        'data-is-header': String(Boolean(ctx.isHeader)),
      } as Record<string, unknown>)}>
      {label}: inCell={String(inCell)} isHeader={String(Boolean(ctx.isHeader))}
    </SizableText>
  );
}

export const main = {
  name: 'Main',
  render: () => (
    <YStack gap="$3">
      <Probe label="outside" />
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <XStack>
                <Probe label="header" />
              </XStack>
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <Probe label="body" />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    </YStack>
  ),
};
