import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Geolocation } from '.';
import type { GeolocationProps } from '.';

export default {
  title: 'FrappeUI/Geolocation',
  component: Geolocation,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Frappe Geolocation field (JSON lat/lng string) supplying the location icon.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
  },
};

type StoryProps = GeolocationProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <Geolocation
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Location',
  value: '{"lat": 30.2672, "lng": -97.7431}',
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const States = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="Disabled"
      disabled
    />
    <Controlled
      {...args}
      label="Disabled + error"
      disabled
      error="Broken while disabled"
    />
    <Controlled
      {...args}
      label="Required"
      required
    />
    <Controlled
      {...args}
      label="Error"
      error="Value does not match the required format"
    />
    <Controlled
      {...args}
      label="Helper text"
      helperText="Some helpful context"
    />
  </YStack>
);
States.args = {
  label: 'Location',
  value: '{"lat": 30.2672, "lng": -97.7431}',
} as Partial<StoryProps>;
// LC-57 allowlist: the Disabled rows demo the disabled dial, and Geolocation's
// internal Locate/Coordinates Buttons have no disabledReason plumbing yet
// (component-contract follow-up). The warn still fires; the harvester tolerates
// exactly this code.
States.parameters = {
  guardrailSpecimen: {
    warns: ['bare-disabled'],
    reason: "Disabled-dial rows: Geolocation's internal action Buttons have no disabledReason plumbing yet.",
  },
};

/**
 * Thin-adapter contract probe: forwards readOnly / skeleton / compact through
 * the adapter. The underlying forms field supports all three; if the adapter
 * drops them these three render identically to Main.
 */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="readOnly probe"
      {...({ readOnly: true } as any)}
    />
    <Controlled
      {...args}
      label="skeleton probe"
      {...({ skeleton: true } as any)}
    />
    <Controlled
      {...args}
      label="compact probe"
      {...({ compact: true } as any)}
    />
  </YStack>
);
ContractProbe.args = {
  label: 'Location',
  value: '{"lat": 30.2672, "lng": -97.7431}',
} as Partial<StoryProps>;

type GeoValue = { lat: number; lng: number } | null;
interface GeoRow {
  id: string;
  label: string;
  value: GeoValue;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<GeoRow[]>([
      { id: '1', label: 'Alpha', value: { lat: 30.2672, lng: -97.7431 } },
      { id: '2', label: 'Beta', value: { lat: 12.9716, lng: 77.5946 } },
      { id: '3', label: 'Gamma', value: null },
    ]);
    const columns: DataTableColumn<GeoRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Site', ...fieldtypeToTableField('Geolocation') },
    ];
    return (
      <FrappeStoryProvider>
        <YStack
          width="100%"
          height={320}>
          <DataTable
            data={data}
            columns={columns}
            enablePagination={false}
            onDataChange={setData}
          />
        </YStack>
      </FrappeStoryProvider>
    );
  },
};
