import { ArrowsOutIcon, NavigationArrowIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useCallback, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import type { GeocodeResult, Geocoder } from './geocoder';
import { GeocoderProvider } from './geocoderContext';
import { parseGeoValue } from './geoValue';
import { createPhotonGeocoder } from './photonGeocoder';

import { Geolocation, type GeolocationProps } from './index';

const meta: Meta<typeof Geolocation> = {
  title: 'Forms/Geolocation',
  component: Geolocation,
  parameters: {
    docs: {
      description: {
        component:
          'Search-first geolocation field. Inject `geocode` / `reverseGeocode` (or a `geocoder` object), or wrap an app in `GeocoderProvider`; the field supplies no provider of its own. `createPhotonGeocoder()` is a keyless opt-in adapter (the Live stories use it). The map is the output and carries no controls: coordinates, Locate and Expand sit in a row below it. LC-19 preflight gates Locate. LC-21: no Apply on the coordinate editor.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    value: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Geolocation>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          location: JSON.stringify({ lat: 48.8566, lng: 2.3522 }),
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={500}>
          <YStack gap="$4">
            <Geolocation
              label="Delivery Location"
              name="location"
              helperText="Click the map or use Locate to set the delivery pin"
              locationIcon=<NavigationArrowIcon size={16} />
            />
            <Button action="submit">Save Location</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Location',
    helperText: 'Click the map to set a pin, or edit the coordinates below it',
  },
  render: (args) => <Geolocation {...args} locationIcon=<NavigationArrowIcon size={16} /> />,
};

/**
 * Bare contract (UX-010 / Axiom 13 ONE BODY): no `locationIcon` — the package
 * default navigation-arrow glyph renders on the Locate overlay.
 */
export const Bare: Story = {
  args: {
    label: 'Location',
    helperText: 'No locationIcon prop — package default glyph',
    value: JSON.stringify({ lat: 48.8566, lng: 2.3522 }),
    onChange: action('onChange'),
  },
};

export const Basic: Story = {
  args: {
    label: 'Location',
    helperText: 'Click the map to set a pin, or edit the coordinates below it',
    onChange: action('onChange'),
  },
  render: (args) => <Geolocation {...args} locationIcon=<NavigationArrowIcon size={16} /> />,
};

export const Disabled: Story = {
  parameters: {
    // Allowlist: disabled-dial demo; Geolocation's internal action
    // Buttons have no disabledReason plumbing yet (component-contract follow-up).
    guardrailSpecimen: {
      warns: ['bare-disabled'],
      reason: "Disabled-dial specimen: Geolocation's internal action Buttons have no disabledReason plumbing yet.",
    },
  },
  args: {
    label: 'Location',
    helperText: 'This field is disabled',
    disabled: true,
    onChange: action('onChange'),
  },
  render: (args) => <Geolocation {...args} locationIcon=<NavigationArrowIcon size={16} /> />,
};

export const WithError: Story = {
  args: {
    label: 'Location',
    helperText: 'Click the map to set a pin, or edit the coordinates below it',
    required: true,
    error: 'Location is required',
    onChange: action('onChange'),
  },
  render: (args) => <Geolocation {...args} locationIcon=<NavigationArrowIcon size={16} /> />,
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={500}>
      <Text fontWeight="bold">Size $2</Text>
      <Geolocation
        label="Small"
        size="$2"
        locationIcon=<NavigationArrowIcon size={16} />
        onChange={action('onChange')}
      />
      <Text fontWeight="bold">Size $3</Text>
      <Geolocation
        label="Medium"
        size="$3"
        locationIcon=<NavigationArrowIcon size={16} />
        onChange={action('onChange')}
      />
      <Text fontWeight="bold">Size $4</Text>
      <Geolocation
        label="Large"
        size="$4"
        locationIcon=<NavigationArrowIcon size={16} />
        onChange={action('onChange')}
      />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState(JSON.stringify({ lat: 40.7128, lng: -74.006 }));
      const parsed = parseGeoValue(value);
      return (
        <YStack gap="$4" maxWidth={500}>
          <Geolocation
            label="Pick Location"
            helperText={`Lat: ${parsed?.lat.toFixed(4) ?? ''}, Lng: ${parsed?.lng.toFixed(4) ?? ''}`}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            locationIcon=<NavigationArrowIcon size={16} />
          />
          <Geolocation label="Disabled" disabled locationIcon=<NavigationArrowIcon size={16} /> />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const WithCoordinates: Story = {
  render: () => {
    const Example = () => {
      const [value, setValue] = useState(JSON.stringify({ lat: 37.7749, lng: -122.4194 }));
      const parsed = parseGeoValue(value);
      return (
        <YStack gap="$4" maxWidth={500}>
          <Geolocation
            label="Office Location"
            helperText={`Lat: ${parsed?.lat.toFixed(4) ?? ''}, Lng: ${parsed?.lng.toFixed(4) ?? ''}`}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            locationIcon=<NavigationArrowIcon size={16} />
          />
        </YStack>
      );
    };
    return <Example />;
  },
};

// Reads the `disabled` dial so it is reachable on the one story that has an
// expand button: `disabled` and `expandIcon` never met in any other specimen,
// which is how "Expand opens while disabled" went unmeasured. Undefined by
// default, so the default render (and its baseline) is unchanged.
export const WithExpandButton: Story = {
  render: ({ disabled }) => {
    const Example = () => {
      const [value, setValue] = useState(JSON.stringify({ lat: 51.5074, lng: -0.1278 }));
      return (
        <YStack gap="$4" maxWidth={500}>
          <Geolocation
            label="Delivery Location"
            helperText="Press Expand below the map for a larger view"
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            locationIcon=<NavigationArrowIcon size={16} />
            expandIcon=<ArrowsOutIcon size={16} />
            disabled={disabled}
          />
        </YStack>
      );
    };
    return <Example />;
  },
};

export const ExpandableInForm: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          location: JSON.stringify({ lat: 35.6762, lng: 139.6503 }),
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={500}>
          <YStack gap="$4">
            <Geolocation
              label="Meeting Point"
              name="location"
              helperText="Expand the map to see the full area"
              locationIcon=<NavigationArrowIcon size={16} />
              expandIcon=<ArrowsOutIcon size={16} />
            />
            <Button action="submit">Confirm Location</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the field + map anatomy. */
export const SkeletonState: Story = {
  render: (args) => <Geolocation {...args} locationIcon=<NavigationArrowIcon size={16} /> />,
  args: { label: 'Location', skeleton: true },
};

const places: GeocodeResult[] = [
  { lat: 60.16952, lng: 24.93545, label: 'Mannerheimintie 3', description: 'Kamppi, Helsinki' },
  { lat: -33.8688, lng: 151.2093, label: 'Sydney', description: 'New South Wales, Australia' },
];

const fakeGeocoder: Geocoder = {
  geocode: async ({ query }) =>
    places.filter((place) => `${place.label} ${place.description}`.toLowerCase().includes(query.trim().toLowerCase())),
  reverseGeocode: async ({ lat, lng }) =>
    places.find((place) => Math.abs(place.lat - lat) < 0.01 && Math.abs(place.lng - lng) < 0.01) ?? null,
};

function FakeProviderExample(props: GeolocationProps) {
  const [value, setValue] = useState(props.value ?? '');
  return <Geolocation {...props} value={value} onChange={setValue} />;
}

export const SearchWithFakeProvider: Story = {
  args: {
    label: 'Location',
    helperText: 'Search Sydney or Helsinki. This example uses an offline provider.',
    geocoder: fakeGeocoder,
  },
  render: (args) => <FakeProviderExample {...args} />,
};

export const AddressWithFakeProvider: Story = {
  args: {
    label: 'Office',
    value: JSON.stringify({ lat: 60.16952, lng: 24.93545 }),
    geocoder: fakeGeocoder,
    readOnly: true,
  },
};

export const FailedFakeProvider: Story = {
  args: {
    label: 'Location',
    geocode: async () => {
      throw new Error('Offline example failure');
    },
  },
  render: (args) => <FakeProviderExample {...args} />,
};

/** Direct cell contract, independent of the table adapter's display formatter. */
export const CellWithFakeProvider: Story = {
  args: {
    label: 'Location',
    value: JSON.stringify({ lat: 60.16952, lng: 24.93545 }),
    geocoder: fakeGeocoder,
  },
  render: (args) => (
    <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
      <FakeProviderExample {...args} />
    </TableCellContext.Provider>
  ),
};

function DeferredControlledExample() {
  const [value, setValue] = useState(JSON.stringify({ lat: places[0].lat, lng: places[0].lng }));
  const [proposal, setProposal] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  return (
    <YStack gap="$3">
      <Geolocation label="Location" value={value} onChange={setProposal} readOnly={readOnly} geocoder={fakeGeocoder} />
      <Text>The parent holds the current location until it accepts the proposal.</Text>
      <Button
        onPress={() => {
          setReadOnly(!readOnly);
        }}>
        {readOnly ? 'Edit search' : 'Show selected fact'}
      </Button>
      {proposal !== null ? (
        <Button
          onPress={() => {
            setValue(proposal);
          }}>
          Accept proposed location
        </Button>
      ) : null}
    </YStack>
  );
}

export const DeferredControlledSelection: Story = {
  render: () => <DeferredControlledExample />,
};

function PendingReverseExample() {
  const [value, setValue] = useState(JSON.stringify({ lat: places[0].lat, lng: places[0].lng }));
  const [readOnly, setReadOnly] = useState(true);
  const [resolvePending, setResolvePending] = useState<(() => void) | null>(null);
  const reverseGeocode = useCallback<NonNullable<GeolocationProps['reverseGeocode']>>(({ lat }) => {
    if (lat === places[0].lat) {
      return Promise.resolve(places[0]);
    }
    return new Promise((resolve) => {
      setResolvePending(() => () => resolve(places[1]));
    });
  }, []);
  return (
    <YStack gap="$3">
      <Geolocation
        label="Location"
        value={value}
        readOnly={readOnly}
        geocode={fakeGeocoder.geocode}
        reverseGeocode={reverseGeocode}
      />
      <Button
        onPress={() => {
          setReadOnly(!readOnly);
        }}>
        {readOnly ? 'Edit search' : 'Show selected fact'}
      </Button>
      <Button
        onPress={() => {
          setValue(JSON.stringify({ lat: places[1].lat, lng: places[1].lng }));
        }}>
        Move bound location to Sydney
      </Button>
      {resolvePending ? (
        <Button
          onPress={() => {
            resolvePending();
            setResolvePending(null);
          }}>
          Resolve Sydney address
        </Button>
      ) : null}
    </YStack>
  );
}

export const PendingControlledReverse: Story = {
  render: () => <PendingReverseExample />,
};

const photon = createPhotonGeocoder();

function LiveField(props: GeolocationProps) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Geolocation
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        action('onChange')(next);
      }}
    />
  );
}

/**
 * Keyless live search through Photon (photon.komoot.io). Type a place name;
 * the results panel lists real geocoded places. No key, no account.
 */
export const LiveKeylessSearch: Story = {
  render: () => (
    <GeocoderProvider geocoder={photon}>
      <YStack gap="$4" maxWidth={500}>
        <LiveField label="Location" expandIcon=<ArrowsOutIcon size={16} /> />
      </YStack>
    </GeocoderProvider>
  ),
};

/** A set value reverse-geocodes to an address, editable and read-only. */
export const LiveKeylessAddress: Story = {
  render: () => (
    <GeocoderProvider geocoder={photon}>
      <YStack gap="$4" maxWidth={500}>
        <LiveField label="Office" value={JSON.stringify({ lat: 60.16952, lng: 24.93545 })} />
        <Geolocation label="Office (read-only)" value={JSON.stringify({ lat: 60.16952, lng: 24.93545 })} readOnly />
      </YStack>
    </GeocoderProvider>
  ),
};
