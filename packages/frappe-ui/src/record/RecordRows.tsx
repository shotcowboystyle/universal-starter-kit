import { useResolvedKnobs } from '@repo/theme';
import { Accordion, Card, Chip, Text, XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { groupRows, sortRows } from './recordData';
import { slugWords } from './recordSections';
import type { FrappeRecordRowsSection } from './recordSections';

type Row = Record<string, unknown>;

function RowTiles({ rows, section }: { rows: readonly Row[]; section: FrappeRecordRowsSection }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      {...knobProps.gap}
      flexWrap="wrap">
      {rows.map((row, index) => {
        const detail = section.detail ? Number(row[section.detail.field]) : 0;
        return (
          <Card
            key={typeof row.name === 'string' ? row.name : index}
            {...knobProps.cardSurface}
            backgroundColor="$color2"
            paddingVertical="$2"
            paddingHorizontal="$3"
            flexGrow={0}>
            <XStack
              alignItems="center"
              gap="$2">
              <Text
                textTransform="capitalize"
                fontWeight="600">
                {slugWords(String(row[section.field] ?? ''))}
              </Text>
              {section.flag && row[section.flag.field] ? (
                <Chip
                  size="$2"
                  color="purple">
                  {section.flag.label}
                </Chip>
              ) : null}
              {section.detail && detail > 0 ? (
                <Chip
                  size="$2"
                  color="blue">
                  {section.detail.label(detail)}
                </Chip>
              ) : null}
            </XStack>
          </Card>
        );
      })}
    </XStack>
  );
}

/**
 * A record's linked rows as flat tiles that wrap, in the declared order,
 * flagged and detailed per row; grouped, each group is an accordion section
 * with its count, the first open.
 */
export function RecordRows({ rows, section }: { rows: readonly Row[]; section: FrappeRecordRowsSection }) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  if (rows.length === 0) {
    return (
      <Text
        color="$color10"
        fontSize="$3">
        {section.empty ?? t('None yet')}
      </Text>
    );
  }
  const sorted = sortRows(rows, section.orderBy ?? []);
  if (!section.groupBy) {
    return (
      <RowTiles
        rows={sorted}
        section={section}
      />
    );
  }
  const groups = groupRows(sorted, section.groupBy.field);
  const groupValue = (value: string) => value || 'other';
  return (
    <YStack {...knobProps.gap}>
      <Accordion
        type="multiple"
        defaultValue={[groupValue(groups[0]?.value ?? '')]}>
        {groups.map((group) => (
          <Accordion.Item
            key={groupValue(group.value)}
            value={groupValue(group.value)}>
            <Accordion.Trigger>
              <XStack
                alignItems="center"
                gap="$2"
                flexWrap="wrap">
                <Text fontWeight="600">{section.groupBy?.label(group.value)}</Text>
                <Chip size="$2">{group.rows.length}</Chip>
              </XStack>
            </Accordion.Trigger>
            <Accordion.Content>
              <RowTiles
                rows={group.rows}
                section={section}
              />
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion>
    </YStack>
  );
}
