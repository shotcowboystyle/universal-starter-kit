import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, XStack, YStack } from 'tamagui';

import type { FieldDisplayType } from './index';
import { FieldDisplay } from './index';

const meta: Meta<typeof FieldDisplay> = {
  title: 'Forms/FieldDisplay',
  component: FieldDisplay,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    field: {
      control: 'select',
      options: [
        'input',
        'textarea',
        'stepper',
        'slider',
        'select',
        'checkbox',
        'switch',
        'datepicker',
        'datetimepicker',
        'daterangepicker',
        'colorpicker',
        'duration',
        'fileupload',
        'image',
        'signature',
        'geolocation',
        'richtexteditor',
        'custom',
      ] satisfies FieldDisplayType[],
    },
    value: { control: 'text' },
  },
  args: {
    field: 'input',
    value: 'Hello world',
  },
};

export default meta;
type Story = StoryObj<typeof FieldDisplay>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <XStack gap="$3" alignItems="flex-start">
      <Paragraph size="$2" width={180} color="$placeholderColor" paddingTop="$2">
        {label}
      </Paragraph>
      <XStack flex={1} minWidth={0}>
        {children}
      </XStack>
    </XStack>
  );
}

export const Basic: Story = {
  render: (args) => <FieldDisplay {...args} />,
};

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const AllTypes: Story = {
  render: () => (
    <YStack gap="$2" maxWidth={560}>
      <Row label="input">
        <FieldDisplay field="input" value="Plain text value" />
      </Row>
      <Row label="textarea (multiline)">
        <FieldDisplay field="textarea" value={'line one\nline two\nline three'} />
      </Row>
      <Row label="stepper (number)">
        <FieldDisplay field="stepper" value={42} />
      </Row>
      <Row label="stepper (currency)">
        <FieldDisplay field="stepper" value={1234.5} fieldProps={{ currency: 'USD', precision: 2 }} />
      </Row>
      <Row label="slider (percentish)">
        <FieldDisplay field="slider" value={0.75} />
      </Row>
      <Row label="progress">
        <FieldDisplay field="progress" value={64} fieldProps={{ max: 100 }} />
      </Row>
      <Row label="rating">
        <FieldDisplay field="rating" value={0.8} fieldProps={{ maxStars: 5 }} />
      </Row>
      <Row label="select (label lookup)">
        <FieldDisplay
          field="select"
          value="b"
          fieldProps={{
            options: [
              { label: 'Alpha', value: 'a' },
              { label: 'Beta', value: 'b', color: 'blue' },
            ],
          }}
        />
      </Row>
      <Row label="checkbox true">
        <FieldDisplay field="checkbox" value={true} />
      </Row>
      <Row label="checkbox false">
        <FieldDisplay field="checkbox" value={false} />
      </Row>
      <Row label="datepicker">
        <FieldDisplay field="datepicker" value="2026-01-15" />
      </Row>
      <Row label="datetimepicker">
        <FieldDisplay field="datetimepicker" value="2026-01-15T14:30:00Z" />
      </Row>
      <Row label="daterangepicker">
        <FieldDisplay field="daterangepicker" value="2026-01-01" linkedValue="2026-01-31" />
      </Row>
      <Row label="colorpicker">
        <FieldDisplay field="colorpicker" value="#ff0088" />
      </Row>
      <Row label="duration (3725s)">
        <FieldDisplay field="duration" value={3725} />
      </Row>
      <Row label="fileupload (one)">
        <FieldDisplay field="fileupload" value="report.pdf" />
      </Row>
      <Row label="fileupload (many)">
        <FieldDisplay field="fileupload" value={['a.pdf', 'b.pdf', 'c.pdf']} />
      </Row>
      <Row label="image">
        <FieldDisplay field="image" value={TINY_PNG} />
      </Row>
      <Row label="signature">
        <FieldDisplay field="signature" value={TINY_PNG} />
      </Row>
      <Row label="geolocation">
        <FieldDisplay field="geolocation" value={{ lat: 30.2672, lng: -97.7431 }} />
      </Row>
      <Row label="richtexteditor">
        <FieldDisplay field="richtexteditor" value="<p>Rich <b>text</b> content</p>" />
      </Row>
      <Row label="unknown/custom">
        <FieldDisplay field="custom" value={{ some: 'object' }} />
      </Row>
      <Row label="link (https)">
        <FieldDisplay field="input" value="https://example.com/item" />
      </Row>
    </YStack>
  ),
};

export const EmptyAndFalsy: Story = {
  render: () => (
    <YStack gap="$2" maxWidth={560}>
      <Row label="input null">
        <FieldDisplay field="input" value={null} />
      </Row>
      <Row label="input undefined">
        <FieldDisplay field="input" value={undefined} />
      </Row>
      <Row label="input empty string">
        <FieldDisplay field="input" value="" />
      </Row>
      <Row label="stepper zero (valid!)">
        <FieldDisplay field="stepper" value={0} />
      </Row>
      <Row label="checkbox false (valid!)">
        <FieldDisplay field="checkbox" value={false} />
      </Row>
      <Row label="checkbox null">
        <FieldDisplay field="checkbox" value={null} />
      </Row>
      <Row label="duration zero">
        <FieldDisplay field="duration" value={0} />
      </Row>
      <Row label="datepicker empty">
        <FieldDisplay field="datepicker" value="" />
      </Row>
      <Row label="colorpicker empty">
        <FieldDisplay field="colorpicker" value="" />
      </Row>
      <Row label="image empty">
        <FieldDisplay field="image" value="" />
      </Row>
    </YStack>
  ),
};

export const UnsafeAndLongContent: Story = {
  render: () => (
    <YStack gap="$2" maxWidth={560}>
      <Row label="html in input">
        <FieldDisplay field="input" value='<img src=x onerror="alert(1)">' />
      </Row>
      <Row label="html in richtext">
        <FieldDisplay field="richtexteditor" value='<script>alert(1)<\/script><p onclick="alert(2)">click me</p>' />
      </Row>
      <Row label="js url as text">
        <FieldDisplay field="input" value="javascript:alert(1)" />
      </Row>
      <Row label="very long text">
        <FieldDisplay
          field="input"
          value={
            'This value is extremely long and should truncate to a single line with an ellipsis rather than wrapping or overflowing its container ' +
            'x'.repeat(200)
          }
        />
      </Row>
      <Row label="broken image url">
        <FieldDisplay field="image" value="https://invalid.invalid/broken.png" />
      </Row>
      <Row label="invalid date">
        <FieldDisplay field="datepicker" value="not-a-date" />
      </Row>
      <Row label="NaN number">
        <FieldDisplay field="stepper" value="abc" />
      </Row>
    </YStack>
  ),
};
