import {
  BarcodeIcon,
  CameraIcon,
  ClockIcon,
  EraserIcon,
  NavigationArrowIcon,
  StarIcon,
  XIcon,
} from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useCallback, useState } from 'react';
import { H3, Separator, YStack } from 'tamagui';

import { Button } from '../Button';
import { formatFieldError } from '../ErrorSummary';
import { FieldGroup } from '../FieldGroup';
// Note: DataTable lives in a separate table package
// See table package stories for DataTable + Form integration examples
import { Barcode } from '../fields/Barcode';
import { Checkbox, CheckboxGroup } from '../fields/Checkbox';
import { ColorPicker } from '../fields/ColorPicker';
import { Combobox, type ComboboxOption } from '../fields/Combobox';
import { authorOptions, shortAuthorOptions } from '../fields/Combobox/authorOptions';
import { DatePicker, DateRangePicker, DatetimePicker, MonthPicker, MultiDatePicker } from '../fields/DatePicker';
import { Duration } from '../fields/Duration';
import { FileUpload } from '../fields/FileUpload';
import { Geolocation } from '../fields/Geolocation';
import { Input } from '../fields/Input';
import { MentionInput, type MentionConfig } from '../fields/MentionInput';
import { OTPInput } from '../fields/OTPInput';
import { PhoneInput } from '../fields/PhoneInput';
import { Progress } from '../fields/Progress';
import { RadioGroup } from '../fields/RadioGroup';
import { Rating } from '../fields/Rating';
import { Select } from '../fields/Select';
import { Signature } from '../fields/Signature';
import { Slider } from '../fields/Slider';
import { Stepper } from '../fields/Stepper';
import { Switch } from '../fields/Switch';
import { TextArea } from '../fields/TextArea';
import { TimePicker } from '../fields/TimePicker';
import { ToggleGroup } from '../fields/ToggleGroup';
import { FormGrid } from '../FormGrid';
import { FormSection, FormSectionStack } from '../FormSection';
import { formReadableMaxWidth } from '../formSpacing';
import type { AnyFormApi } from '../types';

import { Form, FormActions } from './index';

const meta: Meta<typeof Form> = {
  title: 'Forms/Form',
  component: Form,
  parameters: {
    docs: {
      description: {
        component:
          'A form wrapper component that provides TanStack Form context and handles form submission with URL state sync support.',
      },
    },
  },
  argTypes: {
    syncWithUrl: {
      control: 'boolean',
      description: 'Sync form state with URL query parameters',
    },
    urlDebounceMs: {
      control: 'number',
      description: 'Debounce time for URL sync in milliseconds',
    },
    compact: {
      control: 'boolean',
      description: 'Nested scale — compact density for dialogs/overlays (LC-73)',
    },
  },
};

export default meta;
type _Story = StoryObj<typeof Form>;

export const Basic = () => (
  <Form
    maxWidth={formReadableMaxWidth}
    width="100%"
    formOptions={{
      defaultValues: {
        username: '',
        email: '',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <Input label="Username" name="username" required />
    <Input label="Email" name="email" required />
    <FormActions>
      <Button action="submit">Submit</Button>
    </FormActions>
  </Form>
);
Basic.storyName = 'Main';

export const WithSaveBar = () => (
  <Form
    saveBar
    maxWidth={formReadableMaxWidth}
    width="100%"
    formOptions={{
      defaultValues: {
        username: 'desk-user',
        email: 'desk@example.com',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <Input label="Username" name="username" required />
    <Input label="Email" name="email" required />
  </Form>
);
WithSaveBar.storyName = 'Save bar';

export const WithValidation = () => (
  <Form
    formOptions={{
      defaultValues: {
        password: '',
        confirmPassword: '',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <Input
      label="Password"
      name="password"
      validators={{
        onChange: ({ value }) => (value.length < 8 ? 'Password must be at least 8 characters' : undefined),
      }}
      required
    />
    <Input
      label="Confirm Password"
      name="confirmPassword"
      validators={{
        onChangeListenTo: ['password'],
        onChange: ({ value, fieldApi }) => {
          const password = fieldApi.form.getFieldValue('password');
          return value !== password ? 'Passwords must match' : undefined;
        },
      }}
      required
    />
    <FormActions>
      <Button action="submit">Create Account</Button>
    </FormActions>
  </Form>
);

/**
 * Submit with empty required fields → ErrorSummary above the form,
 * role=alert, auto-focused, with links that jump to each invalid control.
 * Pass `id={name}` on fields so summary anchors resolve.
 *
 * Copy uses formatFieldError({ problem, action }) so inline + summary stay in
 * sync (FieldLayout still stringifies raw objects; prefer formatted strings
 * until fieldLayout understands structured errors).
 */
export const WithErrorSummary = () => (
  <Form
    formOptions={{
      defaultValues: {
        fullName: '',
        email: '',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}
    errorSummaryTitle="There is a problem"
    maxWidth={formReadableMaxWidth}
    width="100%">
    <Input
      id="fullName"
      name="fullName"
      label="Full name"
      required
      validators={{
        onSubmit: ({ value }) =>
          !String(value || '').trim()
            ? formatFieldError({
                problem: 'Full name is empty.',
                action: 'Enter your first and last name.',
              })
            : undefined,
      }}
    />
    <Input
      id="email"
      name="email"
      label="Email"
      required
      validators={{
        onSubmit: ({ value }) => {
          const v = String(value || '');
          if (!v.trim()) {
            return formatFieldError({
              problem: 'Email is empty.',
              action: 'Enter an email address.',
            });
          }
          if (!v.includes('@')) {
            return formatFieldError({
              problem: 'Email is incomplete.',
              action: 'Include an @ and a domain.',
            });
          }
          return undefined;
        },
      }}
    />
    <FormActions>
      <Button action="submit">Save contact</Button>
    </FormActions>
  </Form>
);
WithErrorSummary.parameters = {
  docs: {
    description: {
      story:
        'On failed submit, Form renders ErrorSummary (role=alert) above the fields, moves focus to it, and lists the same messages as inline errors. Each link focuses the matching control (`id` should match the field `name`). Default `validateOn="submit"` remaps field validators to blur-then-change after the first submit attempt so errors clear live.',
    },
  },
};

export const DynamicFields = () => {
  const form = useForm({
    defaultValues: {
      accountType: 'personal',
      companyName: '',
      personalInfo: '',
    },
    onSubmit: async ({ value }) => {
      action('onSubmit')(value);
    },
  });

  return (
    <Form form={form} onSubmit={() => form.handleSubmit()}>
      <Select
        label="Account Type"
        name="accountType"
        required
        // >5 options: shorter single-select lists trip `select-too-few-options`.
        options={[
          { label: 'Personal', value: 'personal' },
          { label: 'Business', value: 'business' },
          { label: 'Nonprofit', value: 'nonprofit' },
          { label: 'Government', value: 'government' },
          { label: 'Education', value: 'education' },
          { label: 'Other', value: 'other' },
        ]}
      />

      {(() => {
        const FormSubscribe = (
          form as {
            Subscribe: (p: { selector: (s: any) => any[]; children: (v: any[]) => any }) => any;
          }
        ).Subscribe;
        return (
          <FormSubscribe selector={(state: any) => [state.values.accountType]}>
            {([accountType]) => (
              <>
                {accountType === 'business' ? (
                  <Input label="Company Name" name="companyName" required helperText="Enter your company name" />
                ) : (
                  <Input label="Personal Info" name="personalInfo" helperText="Tell us about yourself" />
                )}
              </>
            )}
          </FormSubscribe>
        );
      })()}

      <FormActions>
        <Button action="submit">Submit</Button>
      </FormActions>
    </Form>
  );
};

export const ReadOnlyAndDisabledSubmit = () => (
  <Form
    formOptions={{
      defaultValues: {
        editable: 'included in submit',
        readOnlyField: 'included in submit',
        disabledField: 'included in submit (not editable)',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <Input label="Editable" name="editable" />
    <Input label="Read Only" name="readOnlyField" readOnly />
    <Input label="Disabled" name="disabledField" disabled />
    <FormActions>
      <Button action="submit">Submit</Button>
    </FormActions>
  </Form>
);
ReadOnlyAndDisabledSubmit.parameters = {
  docs: {
    description: {
      story:
        'readOnly values are included in submit. Disabled fields are non-editable and visually muted but remain in TanStack Form payload unless filtered by app logic.',
    },
  },
};

export const InputWithLinkResolver = () => (
  <Form
    formOptions={{
      defaultValues: {
        itemCode: 'ITEM-001',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <Input
      label="Item Code (readOnly + linkResolver)"
      name="itemCode"
      readOnly
      linkResolver={(v) => (v ? (`/items/${String(v)}` as any) : null)}
    />
    <FormActions>
      <Button action="submit">Submit</Button>
    </FormActions>
  </Form>
);
InputWithLinkResolver.parameters = {
  docs: {
    description: {
      story:
        'When readOnly and linkResolver are provided, the value renders as a Link when linkResolver returns href. Frappe wrappers provide doctype-aware resolvers.',
    },
  },
};

// Six entries: still renders without scroll (the "short list" the story demos)
// while clearing the ≤5 `select-too-few-options` guardrail.
const shortPriorityOptions = [
  { value: 'lowest', label: 'Lowest' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'highest', label: 'Highest' },
  { value: 'critical', label: 'Critical' },
];

// Six entries: still the "short list" the story demos, while clearing the ≤5
// `select-too-few-options` guardrail.
const shortCountryOptions: ComboboxOption[] = [
  { value: 'us', label: 'United States', keywords: 'usa america' },
  { value: 'ca', label: 'Canada', keywords: 'north america' },
  { value: 'uk', label: 'United Kingdom', keywords: 'britain england' },
  { value: 'de', label: 'Germany', keywords: 'europe deutschland' },
  { value: 'fr', label: 'France', keywords: 'europe paris' },
  { value: 'jp', label: 'Japan', keywords: 'asia tokyo' },
];

const countryOptions: ComboboxOption[] = [
  { value: 'af', label: 'Afghanistan', keywords: 'asia kabul' },
  { value: 'al', label: 'Albania', keywords: 'europe tirana' },
  { value: 'dz', label: 'Algeria', keywords: 'africa algiers' },
  { value: 'ad', label: 'Andorra', keywords: 'europe' },
  { value: 'ao', label: 'Angola', keywords: 'africa luanda' },
  { value: 'ag', label: 'Antigua and Barbuda', keywords: 'caribbean' },
  { value: 'ar', label: 'Argentina', keywords: 'south america buenos aires' },
  { value: 'am', label: 'Armenia', keywords: 'asia yerevan' },
  { value: 'au', label: 'Australia', keywords: 'oceania sydney canberra' },
  { value: 'at', label: 'Austria', keywords: 'europe vienna wien' },
  { value: 'az', label: 'Azerbaijan', keywords: 'asia baku' },
  { value: 'bs', label: 'Bahamas', keywords: 'caribbean nassau' },
  { value: 'bh', label: 'Bahrain', keywords: 'middle east asia' },
  { value: 'bd', label: 'Bangladesh', keywords: 'asia dhaka' },
  { value: 'bb', label: 'Barbados', keywords: 'caribbean' },
  { value: 'by', label: 'Belarus', keywords: 'europe minsk' },
  { value: 'be', label: 'Belgium', keywords: 'europe brussels' },
  { value: 'bz', label: 'Belize', keywords: 'central america' },
  { value: 'bj', label: 'Benin', keywords: 'africa' },
  { value: 'bt', label: 'Bhutan', keywords: 'asia thimphu' },
  { value: 'bo', label: 'Bolivia', keywords: 'south america' },
  { value: 'ba', label: 'Bosnia and Herzegovina', keywords: 'europe sarajevo' },
  { value: 'bw', label: 'Botswana', keywords: 'africa gaborone' },
  { value: 'br', label: 'Brazil', keywords: 'south america brasilia' },
  { value: 'bn', label: 'Brunei', keywords: 'asia' },
  { value: 'bg', label: 'Bulgaria', keywords: 'europe sofia' },
  { value: 'bf', label: 'Burkina Faso', keywords: 'africa' },
  { value: 'bi', label: 'Burundi', keywords: 'africa' },
  { value: 'kh', label: 'Cambodia', keywords: 'asia phnom penh' },
  { value: 'cm', label: 'Cameroon', keywords: 'africa yaounde' },
  { value: 'ca', label: 'Canada', keywords: 'north america ottawa' },
  { value: 'cv', label: 'Cape Verde', keywords: 'africa' },
  { value: 'cf', label: 'Central African Republic', keywords: 'africa' },
  { value: 'td', label: 'Chad', keywords: 'africa ndjamena' },
  { value: 'cl', label: 'Chile', keywords: 'south america santiago' },
  { value: 'cn', label: 'China', keywords: 'asia beijing' },
  { value: 'co', label: 'Colombia', keywords: 'south america bogota' },
  { value: 'km', label: 'Comoros', keywords: 'africa' },
  { value: 'cg', label: 'Congo', keywords: 'africa brazzaville' },
  { value: 'cd', label: 'Congo (DRC)', keywords: 'africa kinshasa' },
  { value: 'cr', label: 'Costa Rica', keywords: 'central america san jose' },
  { value: 'hr', label: 'Croatia', keywords: 'europe zagreb' },
  { value: 'cu', label: 'Cuba', keywords: 'caribbean havana' },
  { value: 'cy', label: 'Cyprus', keywords: 'europe nicosia' },
  { value: 'cz', label: 'Czech Republic', keywords: 'europe prague' },
  { value: 'dk', label: 'Denmark', keywords: 'europe copenhagen' },
  { value: 'dj', label: 'Djibouti', keywords: 'africa' },
  { value: 'dm', label: 'Dominica', keywords: 'caribbean' },
  { value: 'do', label: 'Dominican Republic', keywords: 'caribbean santo domingo' },
  { value: 'ec', label: 'Ecuador', keywords: 'south america quito' },
  { value: 'eg', label: 'Egypt', keywords: 'africa cairo' },
  { value: 'sv', label: 'El Salvador', keywords: 'central america' },
  { value: 'gq', label: 'Equatorial Guinea', keywords: 'africa' },
  { value: 'er', label: 'Eritrea', keywords: 'africa asmara' },
  { value: 'ee', label: 'Estonia', keywords: 'europe tallinn baltic' },
  { value: 'sz', label: 'Eswatini', keywords: 'africa swaziland' },
  { value: 'et', label: 'Ethiopia', keywords: 'africa addis ababa' },
  { value: 'fj', label: 'Fiji', keywords: 'oceania pacific' },
  { value: 'fi', label: 'Finland', keywords: 'europe helsinki nordic' },
  { value: 'fr', label: 'France', keywords: 'europe paris' },
  { value: 'ga', label: 'Gabon', keywords: 'africa' },
  { value: 'gm', label: 'Gambia', keywords: 'africa' },
  { value: 'ge', label: 'Georgia', keywords: 'europe tbilisi' },
  { value: 'de', label: 'Germany', keywords: 'europe berlin deutschland' },
  { value: 'gh', label: 'Ghana', keywords: 'africa accra' },
  { value: 'gr', label: 'Greece', keywords: 'europe athens' },
  { value: 'gd', label: 'Grenada', keywords: 'caribbean' },
  { value: 'gt', label: 'Guatemala', keywords: 'central america' },
  { value: 'gn', label: 'Guinea', keywords: 'africa conakry' },
  { value: 'gw', label: 'Guinea-Bissau', keywords: 'africa' },
  { value: 'gy', label: 'Guyana', keywords: 'south america' },
  { value: 'ht', label: 'Haiti', keywords: 'caribbean port-au-prince' },
  { value: 'hn', label: 'Honduras', keywords: 'central america' },
  { value: 'hu', label: 'Hungary', keywords: 'europe budapest' },
  { value: 'is', label: 'Iceland', keywords: 'europe reykjavik nordic' },
  { value: 'in', label: 'India', keywords: 'asia new delhi mumbai' },
  { value: 'id', label: 'Indonesia', keywords: 'asia jakarta' },
  { value: 'ir', label: 'Iran', keywords: 'middle east tehran' },
  { value: 'iq', label: 'Iraq', keywords: 'middle east baghdad' },
  { value: 'ie', label: 'Ireland', keywords: 'europe dublin' },
  { value: 'il', label: 'Israel', keywords: 'middle east jerusalem tel aviv' },
  { value: 'it', label: 'Italy', keywords: 'europe rome roma' },
  { value: 'ci', label: 'Ivory Coast', keywords: "africa cote d'ivoire" },
  { value: 'jm', label: 'Jamaica', keywords: 'caribbean kingston' },
  { value: 'jp', label: 'Japan', keywords: 'asia tokyo' },
  { value: 'jo', label: 'Jordan', keywords: 'middle east amman' },
  { value: 'kz', label: 'Kazakhstan', keywords: 'asia astana' },
  { value: 'ke', label: 'Kenya', keywords: 'africa nairobi' },
  { value: 'ki', label: 'Kiribati', keywords: 'oceania pacific' },
  { value: 'kw', label: 'Kuwait', keywords: 'middle east' },
  { value: 'kg', label: 'Kyrgyzstan', keywords: 'asia bishkek' },
  { value: 'la', label: 'Laos', keywords: 'asia vientiane' },
  { value: 'lv', label: 'Latvia', keywords: 'europe riga baltic' },
  { value: 'lb', label: 'Lebanon', keywords: 'middle east beirut' },
  { value: 'ls', label: 'Lesotho', keywords: 'africa' },
  { value: 'lr', label: 'Liberia', keywords: 'africa monrovia' },
  { value: 'ly', label: 'Libya', keywords: 'africa tripoli' },
  { value: 'li', label: 'Liechtenstein', keywords: 'europe' },
  { value: 'lt', label: 'Lithuania', keywords: 'europe vilnius baltic' },
  { value: 'lu', label: 'Luxembourg', keywords: 'europe' },
  { value: 'mg', label: 'Madagascar', keywords: 'africa' },
  { value: 'mw', label: 'Malawi', keywords: 'africa lilongwe' },
  { value: 'my', label: 'Malaysia', keywords: 'asia kuala lumpur' },
  { value: 'mv', label: 'Maldives', keywords: 'asia' },
  { value: 'ml', label: 'Mali', keywords: 'africa bamako' },
  { value: 'mt', label: 'Malta', keywords: 'europe valletta' },
  { value: 'mh', label: 'Marshall Islands', keywords: 'oceania pacific' },
  { value: 'mr', label: 'Mauritania', keywords: 'africa' },
  { value: 'mu', label: 'Mauritius', keywords: 'africa' },
  { value: 'mx', label: 'Mexico', keywords: 'north america mexico city' },
  { value: 'fm', label: 'Micronesia', keywords: 'oceania pacific' },
  { value: 'md', label: 'Moldova', keywords: 'europe chisinau' },
  { value: 'mc', label: 'Monaco', keywords: 'europe' },
  { value: 'mn', label: 'Mongolia', keywords: 'asia ulaanbaatar' },
  { value: 'me', label: 'Montenegro', keywords: 'europe podgorica' },
  { value: 'ma', label: 'Morocco', keywords: 'africa rabat' },
  { value: 'mz', label: 'Mozambique', keywords: 'africa maputo' },
  { value: 'mm', label: 'Myanmar', keywords: 'asia burma' },
  { value: 'na', label: 'Namibia', keywords: 'africa windhoek' },
  { value: 'nr', label: 'Nauru', keywords: 'oceania pacific' },
  { value: 'np', label: 'Nepal', keywords: 'asia kathmandu' },
  { value: 'nl', label: 'Netherlands', keywords: 'europe amsterdam holland' },
  { value: 'nz', label: 'New Zealand', keywords: 'oceania wellington' },
  { value: 'ni', label: 'Nicaragua', keywords: 'central america managua' },
  { value: 'ne', label: 'Niger', keywords: 'africa niamey' },
  { value: 'ng', label: 'Nigeria', keywords: 'africa lagos abuja' },
  { value: 'kp', label: 'North Korea', keywords: 'asia pyongyang' },
  { value: 'mk', label: 'North Macedonia', keywords: 'europe skopje' },
  { value: 'no', label: 'Norway', keywords: 'europe oslo nordic' },
  { value: 'om', label: 'Oman', keywords: 'middle east muscat' },
  { value: 'pk', label: 'Pakistan', keywords: 'asia islamabad' },
  { value: 'pw', label: 'Palau', keywords: 'oceania pacific' },
  { value: 'ps', label: 'Palestine', keywords: 'middle east' },
  { value: 'pa', label: 'Panama', keywords: 'central america' },
  { value: 'pg', label: 'Papua New Guinea', keywords: 'oceania pacific' },
  { value: 'py', label: 'Paraguay', keywords: 'south america asuncion' },
  { value: 'pe', label: 'Peru', keywords: 'south america lima' },
  { value: 'ph', label: 'Philippines', keywords: 'asia manila' },
  { value: 'pl', label: 'Poland', keywords: 'europe warsaw' },
  { value: 'pt', label: 'Portugal', keywords: 'europe lisbon' },
  { value: 'qa', label: 'Qatar', keywords: 'middle east doha' },
  { value: 'ro', label: 'Romania', keywords: 'europe bucharest' },
  { value: 'ru', label: 'Russia', keywords: 'europe asia moscow' },
  { value: 'rw', label: 'Rwanda', keywords: 'africa kigali' },
  { value: 'kn', label: 'Saint Kitts and Nevis', keywords: 'caribbean' },
  { value: 'lc', label: 'Saint Lucia', keywords: 'caribbean' },
  { value: 'vc', label: 'Saint Vincent and the Grenadines', keywords: 'caribbean' },
  { value: 'ws', label: 'Samoa', keywords: 'oceania pacific' },
  { value: 'sm', label: 'San Marino', keywords: 'europe' },
  { value: 'st', label: 'Sao Tome and Principe', keywords: 'africa' },
  { value: 'sa', label: 'Saudi Arabia', keywords: 'middle east riyadh' },
  { value: 'sn', label: 'Senegal', keywords: 'africa dakar' },
  { value: 'rs', label: 'Serbia', keywords: 'europe belgrade' },
  { value: 'sc', label: 'Seychelles', keywords: 'africa' },
  { value: 'sl', label: 'Sierra Leone', keywords: 'africa freetown' },
  { value: 'sg', label: 'Singapore', keywords: 'asia' },
  { value: 'sk', label: 'Slovakia', keywords: 'europe bratislava' },
  { value: 'si', label: 'Slovenia', keywords: 'europe ljubljana' },
  { value: 'sb', label: 'Solomon Islands', keywords: 'oceania pacific' },
  { value: 'so', label: 'Somalia', keywords: 'africa mogadishu' },
  { value: 'za', label: 'South Africa', keywords: 'africa pretoria cape town' },
  { value: 'kr', label: 'South Korea', keywords: 'asia seoul' },
  { value: 'ss', label: 'South Sudan', keywords: 'africa juba' },
  { value: 'es', label: 'Spain', keywords: 'europe madrid' },
  { value: 'lk', label: 'Sri Lanka', keywords: 'asia colombo' },
  { value: 'sd', label: 'Sudan', keywords: 'africa khartoum' },
  { value: 'sr', label: 'Suriname', keywords: 'south america' },
  { value: 'se', label: 'Sweden', keywords: 'europe stockholm nordic' },
  { value: 'ch', label: 'Switzerland', keywords: 'europe bern zurich' },
  { value: 'sy', label: 'Syria', keywords: 'middle east damascus' },
  { value: 'tw', label: 'Taiwan', keywords: 'asia taipei' },
  { value: 'tj', label: 'Tajikistan', keywords: 'asia dushanbe' },
  { value: 'tz', label: 'Tanzania', keywords: 'africa dar es salaam' },
  { value: 'th', label: 'Thailand', keywords: 'asia bangkok' },
  { value: 'tl', label: 'Timor-Leste', keywords: 'asia' },
  { value: 'tg', label: 'Togo', keywords: 'africa lome' },
  { value: 'to', label: 'Tonga', keywords: 'oceania pacific' },
  { value: 'tt', label: 'Trinidad and Tobago', keywords: 'caribbean' },
  { value: 'tn', label: 'Tunisia', keywords: 'africa tunis' },
  { value: 'tr', label: 'Turkey', keywords: 'europe asia ankara istanbul' },
  { value: 'tm', label: 'Turkmenistan', keywords: 'asia ashgabat' },
  { value: 'tv', label: 'Tuvalu', keywords: 'oceania pacific' },
  { value: 'ug', label: 'Uganda', keywords: 'africa kampala' },
  { value: 'ua', label: 'Ukraine', keywords: 'europe kyiv' },
  { value: 'ae', label: 'United Arab Emirates', keywords: 'middle east dubai abu dhabi' },
  { value: 'uk', label: 'United Kingdom', keywords: 'europe london britain england' },
  { value: 'us', label: 'United States', keywords: 'north america washington usa' },
  { value: 'uy', label: 'Uruguay', keywords: 'south america montevideo' },
  { value: 'uz', label: 'Uzbekistan', keywords: 'asia tashkent' },
  { value: 'vu', label: 'Vanuatu', keywords: 'oceania pacific' },
  { value: 'va', label: 'Vatican City', keywords: 'europe rome' },
  { value: 've', label: 'Venezuela', keywords: 'south america caracas' },
  { value: 'vn', label: 'Vietnam', keywords: 'asia hanoi' },
  { value: 'ye', label: 'Yemen', keywords: 'middle east sanaa' },
  { value: 'zm', label: 'Zambia', keywords: 'africa lusaka' },
  { value: 'zw', label: 'Zimbabwe', keywords: 'africa harare' },
];

const mockUserDatabase: ComboboxOption[] = [
  { value: 'alice', label: 'Alice Johnson', keywords: 'engineer dev' },
  { value: 'bob', label: 'Bob Smith', keywords: 'designer ui' },
  { value: 'charlie', label: 'Charlie Brown', keywords: 'pm product' },
  { value: 'diana', label: 'Diana Prince', keywords: 'lead' },
  { value: 'eve', label: 'Eve Wilson', keywords: 'qa test' },
  { value: 'frank', label: 'Frank Miller', keywords: 'backend' },
  { value: 'grace', label: 'Grace Lee', keywords: 'frontend' },
  { value: 'henry', label: 'Henry Ford', keywords: 'ops' },
  { value: 'iris', label: 'Iris Chang', keywords: 'data science ml' },
  { value: 'jack', label: 'Jack Reacher', keywords: 'security infra' },
  { value: 'karen', label: 'Karen Wu', keywords: 'mobile ios' },
  { value: 'leo', label: 'Leo Tanaka', keywords: 'devops cloud' },
  { value: 'maya', label: 'Maya Patel', keywords: 'fullstack react' },
  { value: 'nick', label: 'Nick Rivera', keywords: 'backend go' },
  { value: 'olivia', label: 'Olivia Chen', keywords: 'design systems' },
  { value: 'paul', label: 'Paul Nguyen', keywords: 'database sql' },
  { value: 'quinn', label: 'Quinn Harper', keywords: 'platform sre' },
  { value: 'rosa', label: 'Rosa Martinez', keywords: 'analytics data' },
  { value: 'sam', label: "Sam O'Brien", keywords: 'frontend vue' },
  { value: 'tara', label: 'Tara Singh', keywords: 'ml research' },
  { value: 'uma', label: 'Uma Krishnan', keywords: 'architect' },
  { value: 'vic', label: 'Vic Romano', keywords: 'product manager' },
  { value: 'wendy', label: 'Wendy Zhou', keywords: 'ux research' },
  { value: 'xander', label: 'Xander Blake', keywords: 'embedded systems' },
  { value: 'yuki', label: 'Yuki Yamamoto', keywords: 'compiler rust' },
  { value: 'zara', label: 'Zara Ahmed', keywords: 'ai nlp' },
];

const mockPageSize = 20;
const mockUserInitialPage = mockUserDatabase.slice(0, mockPageSize);

const userMentions: MentionConfig = {
  trigger: '@',
  data: [
    { id: '1', display: 'Alice', description: 'Engineer' },
    { id: '2', display: 'Bob', description: 'Designer' },
    { id: '3', display: 'Charlie', description: 'PM' },
  ],
  allowSpace: false,
  insertSpace: true,
};

export const AllFields = () => {
  const [userSearchOptions, setUserSearchOptions] = useState<ComboboxOption[]>(mockUserInitialPage);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const handleUserSearch = useCallback((query: string) => {
    setUserSearchLoading(true);
    const timer = setTimeout(() => {
      const results = (
        query.trim()
          ? mockUserDatabase.filter(
              (u) =>
                u.label.toLowerCase().includes(query.toLowerCase()) ||
                (u.keywords && u.keywords.toLowerCase().includes(query.toLowerCase())),
            )
          : mockUserDatabase
      ).slice(0, mockPageSize);
      setUserSearchOptions(results);
      setUserSearchLoading(false);
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      bio: '',
      age: 25,
      country: '',
      priority: '',
      countries: [] as string[],
      author: '',
      authors: [] as string[],
      userSearch: '',
      usersMulti: [] as string[],
      role: '',
      theme: 'light',
      alignment: 'center',
      volume: [50],
      birthDate: null as Date | null,
      appointmentDatetime: null as Date | null,
      fiscalMonth: null as { year: number; month: number } | null,
      vacationDates: [] as Date[],
      projectDateRange: null as { start: Date; end: Date } | null,
      startTime: '09:00',
      taskDuration: 3600,
      richContent: '<p>Welcome to the <strong>rich text</strong> editor!</p>',
      markdownContent: '# Hello\n\nThis is **markdown** content.',
      features: [] as string[],
      phone: '',
      otp: '',
      brandColor: '#3B82F6',
      comment: { text: '', mentions: [] },
      avatar: null,
      acceptTerms: false,
      notifications: true,
      completion: 65,
      rating: 0.6,
      signature: '',
      barcode: '',
      location: JSON.stringify({ lat: 40.7128, lng: -74.006 }),
      items: [] as Record<string, any>[],
    },
    onSubmit: async ({ value }) => {
      action('onSubmit')(value);
    },
  });

  return (
    <Form form={form}>
      <YStack gap="$4">
        <H3>Field Height Comparison (2 columns)</H3>
        <FormGrid columns={2}>
          <Input
            label="Full Name"
            name="fullName"
            placeholder="Jane Doe"
            helperText="Your first and last name"
            required
          />
          <Input
            label="Email"
            name="email"
            placeholder="jane@example.com"
            helperText="We'll never share your email"
            required
          />
          <Select label="Country" name="country" placeholder="Select a country" options={countryOptions} required />
          <Select
            label="Priority"
            name="priority"
            placeholder="Select priority"
            options={shortPriorityOptions}
            helperText="Short list (no scroll)"
          />
          <Combobox
            label="Author"
            name="author"
            options={authorOptions}
            placeholder="Search and select..."
            searchPlaceholder="Type to search..."
            helperText="Full list, filters locally"
          />
          <Combobox
            label="User"
            name="userSearch"
            options={userSearchOptions}
            placeholder="Type to search users..."
            searchPlaceholder="Type to search..."
            emptyMessage="No users found."
            onSearch={handleUserSearch}
            loading={userSearchLoading}
            helperText="onSearch callback (simulated API)"
          />
          <DatePicker label="Birth Date" name={'birthDate' as any} helperText="Select your date of birth" />
          <DatetimePicker label="Appointment" name={'appointmentDatetime' as any} helperText="Select date and time" />
          <TimePicker
            label="Start Time"
            name="startTime"
            helperText="When does your day begin?"
            clockIcon=<ClockIcon size={16} />
          />
          <MonthPicker label="Fiscal Month" name={'fiscalMonth' as any} helperText="Select month and year" />
          <ColorPicker label="Brand Color" name="brandColor" helperText="Pick your favorite color" />
          <DateRangePicker
            label="Project Dates"
            name={'projectDateRange' as any}
            helperText="Select start and end dates"
          />
          <PhoneInput label="Phone Number" name="phone" helperText="Your contact number" />
          <MultiDatePicker
            label="Vacation Days"
            name={'vacationDates' as any}
            helperText="Select multiple dates"
            limit={10}
          />
          <Stepper label="Age" name="age" min={0} max={150} helperText="Your current age" />
          <OTPInput label="Verification Code" name="otp" length={6} helperText="Enter the 6-digit code" />
          <Duration
            label="Task Duration"
            name="taskDuration"
            helperText="How long will this take?"
            clockIcon=<ClockIcon size={16} />
          />
          <Checkbox label="Accept Terms & Conditions" name="acceptTerms" />
          <Slider label="Volume" name="volume" min={0} max={100} helperText="Adjust the volume" />
          <Switch label="Enable Notifications" name="notifications" helperText="Receive push notifications" />
          <Rating label="Quality Rating" name="rating" helperText="Rate from 1 to 5 stars" starIcon={StarIcon} />
          <Geolocation
            label="Location"
            name="location"
            helperText="Set your coordinates"
            locationIcon=<NavigationArrowIcon size={16} />
          />
          <Progress
            label="Profile Completion"
            name="completion"
            form={form as unknown as AnyFormApi}
            helperText="Your profile progress"
          />
          <Barcode
            label="Product Barcode"
            name="barcode"
            helperText="Scan or enter a barcode"
            barcodeIcon=<BarcodeIcon size={18} />
            scanIcon=<CameraIcon size={18} />
            stopIcon=<XIcon size={18} />
          />
        </FormGrid>

        <YStack paddingTop="$4">
          <Separator />
        </YStack>
        <H3>Multi-line Fields</H3>
        <FormGrid columns={2}>
          <TextArea
            label="Bio"
            name="bio"
            textAreaProps={{ placeholder: 'Tell us about yourself...' }}
            helperText="A short description"
          />
          <MentionInput
            label="Comment"
            name="comment"
            mentions={[userMentions]}
            placeholder="Type @ to mention someone"
            helperText="Mention team members with @"
          />
          <RadioGroup
            label="Role"
            name="role"
            helperText="Select your primary role"
            options={[
              { value: 'developer', label: 'Developer' },
              { value: 'designer', label: 'Designer' },
              { value: 'manager', label: 'Manager' },
            ]}
          />
          <CheckboxGroup
            label="Features"
            name="features"
            options={[
              { value: 'notifications', label: 'Push Notifications' },
              { value: 'emails', label: 'Email Updates' },
              { value: 'sms', label: 'SMS Alerts' },
            ]}
            helperText="Select all that apply"
          />
          <ToggleGroup
            label="Theme"
            name="theme"
            type="single"
            orientation="vertical"
            options={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
              { label: 'Auto', value: 'auto' },
            ]}
          />
          <ToggleGroup
            label="Alignment"
            name="alignment"
            type="single"
            orientation="horizontal"
            options={[
              { label: 'Left', value: 'left' },
              { label: 'Center', value: 'center' },
              { label: 'Right', value: 'right' },
            ]}
          />
        </FormGrid>

        <YStack paddingTop="$4">
          <Separator />
        </YStack>
        <H3>Full-width Fields</H3>
        <YStack gap="$4">
          {/* Rich-text form integration is covered by the rich-text package's
              own stories — importing it here would cycle forms → rich-text. */}
          <TextArea
            label="Rich Content"
            name="richContent"
            helperText="Long-form text (rich editor demoed in rich-text stories)"
            numberOfLines={6}
          />
          <Select
            label="Countries (Multi)"
            name="countries"
            placeholder="Select countries..."
            options={countryOptions}
            multiple
            helperText="Multi-select with chips"
          />
          <Combobox
            label="Authors (Multi)"
            name="authors"
            options={authorOptions}
            placeholder="Search and select authors..."
            searchPlaceholder="Type to search..."
            helperText="Multi-select combobox"
            multiple
          />
          <Combobox
            label="Users (Multi)"
            name="usersMulti"
            options={userSearchOptions}
            placeholder="Search and select users..."
            searchPlaceholder="Type to search..."
            emptyMessage="No users found."
            onSearch={handleUserSearch}
            loading={userSearchLoading}
            helperText="Multi-select with onSearch callback"
            multiple
          />
          <FileUpload
            {...({
              label: 'Avatar',
              name: 'avatar',
              form,
              accept: 'image/*',
              helperText: 'Upload a profile picture',
              showPreview: true,
            } as any)}
          />
          <Signature
            label="Signature"
            name="signature"
            helperText="Sign in the box"
            clearIcon=<EraserIcon size={16} />
          />
        </YStack>

        <YStack paddingTop="$4">
          <Separator />
        </YStack>
        <Button action="submit">Submit All Fields</Button>
      </YStack>
    </Form>
  );
};
AllFields.parameters = {
  docs: {
    description: {
      story:
        'A comprehensive showcase of every available form field rendered inside a single Form, demonstrating how they integrate with TanStack Form context.',
    },
  },
};

/**
 * Polaris FormLayout + GOV.UK fieldset rhythm: single column, related
 * short fields grouped, section gap > field gap, left-aligned actions.
 */
export const Layout = () => (
  <Form
    maxWidth={formReadableMaxWidth}
    width="100%"
    formOptions={{
      defaultValues: {
        firstName: '',
        lastName: '',
        email: '',
        city: '',
        postcode: '',
      },
    }}
    onSubmit={(values) => action('onSubmit')(values)}>
    <FormSectionStack>
      <FormSection label="Contact">
        <FieldGroup legend="Name" columns={2}>
          <Input label="First name" name="firstName" required />
          <Input label="Last name" name="lastName" required />
        </FieldGroup>
        <Input label="Email" name="email" required />
      </FormSection>
      <FormSection label="Address">
        <FieldGroup legend="Location" columns={2}>
          <Input label="City" name="city" />
          <Input label="Postcode" name="postcode" />
        </FieldGroup>
      </FormSection>
    </FormSectionStack>
    <FormActions>
      <Button action="submit">Save</Button>
    </FormActions>
  </Form>
);

const shortListDefaults = {
  fullName: '',
  email: '',
  bio: '',
  age: 25,
  country: '',
  author: '',
  role: '',
  theme: 'light',
  alignment: 'center',
  volume: [50],
  birthDate: null as Date | null,
  startTime: '09:00',
  taskDuration: 3600,
  phone: '',
  otp: '',
  brandColor: '#3B82F6',
  comment: { text: '', mentions: [] },
  avatar: null,
  acceptTerms: false,
  notifications: true,
  completion: 65,
  rating: 0.6,
  signature: '',
  barcode: '',
  location: JSON.stringify({ lat: 40.7128, lng: -74.006 }),
  items: [] as Record<string, any>[],
};

export const AllFieldsShortLists = () => {
  const form = useForm({
    defaultValues: shortListDefaults,
    onSubmit: async ({ value }) => {
      action('onSubmit')(value);
    },
  });

  return (
    <Form form={form}>
      <YStack gap="$4" maxWidth={500}>
        <H3>Text Inputs</H3>
        <Input
          label="Full Name"
          name="fullName"
          placeholder="Jane Doe"
          helperText="Your first and last name"
          required
        />
        <Input
          label="Email"
          name="email"
          placeholder="jane@example.com"
          helperText="We'll never share your email"
          required
        />
        <TextArea
          label="Bio"
          name="bio"
          textAreaProps={{ placeholder: 'Tell us about yourself...' }}
          helperText="A short description"
        />
        <Stepper label="Age" name="age" min={0} max={150} helperText="Your current age" />

        <Separator />
        <H3>Selection (short lists)</H3>

        <Select label="Country" name="country" placeholder="Select a country" options={shortCountryOptions} required />

        <Combobox
          label="Author"
          name="author"
          options={shortAuthorOptions}
          placeholder="Search and select..."
          searchPlaceholder="Type to search..."
        />

        <RadioGroup
          label="Role"
          name="role"
          helperText="Select your primary role"
          options={[
            { value: 'developer', label: 'Developer' },
            { value: 'designer', label: 'Designer' },
            { value: 'manager', label: 'Manager' },
          ]}
        />

        <ToggleGroup
          label="Theme"
          name="theme"
          type="single"
          orientation="vertical"
          options={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
            { label: 'Auto', value: 'auto' },
          ]}
        />

        <ToggleGroup
          label="Alignment"
          name="alignment"
          type="single"
          orientation="horizontal"
          options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]}
        />

        <Separator />
        <H3>Toggles</H3>
        <Checkbox label="Accept Terms & Conditions" name="acceptTerms" />
        <Switch label="Enable Notifications" name="notifications" helperText="Receive push notifications" />

        <Separator />
        <H3>Range, Rating & Date/Time</H3>
        <Slider label="Volume" name="volume" min={0} max={100} helperText="Adjust the volume" />
        <Rating label="Quality Rating" name="rating" helperText="Rate from 1 to 5 stars" starIcon={StarIcon} />
        <DatePicker label="Birth Date" name={'birthDate' as any} helperText="Select your date of birth" />
        <TimePicker
          label="Start Time"
          name="startTime"
          helperText="When does your day begin?"
          clockIcon=<ClockIcon size={16} />
        />
        <Duration
          label="Task Duration"
          name="taskDuration"
          helperText="How long will this take?"
          clockIcon=<ClockIcon size={16} />
        />

        {/* DataTable lives in a separate table package */}

        <Separator />
        <H3>Specialized Inputs</H3>
        <PhoneInput label="Phone Number" name="phone" helperText="Your contact number" />
        <OTPInput label="Verification Code" name="otp" length={6} helperText="Enter the 6-digit code" />
        <ColorPicker label="Brand Color" name="brandColor" helperText="Pick your favorite color" />
        <MentionInput
          label="Comment"
          name="comment"
          mentions={[userMentions]}
          placeholder="Type @ to mention someone"
          helperText="Mention team members with @"
        />
        <FileUpload
          {...({
            label: 'Avatar',
            name: 'avatar',
            form,
            accept: 'image/*',
            helperText: 'Upload a profile picture',
            showPreview: true,
          } as any)}
        />
        <Signature label="Signature" name="signature" helperText="Sign in the box" clearIcon=<EraserIcon size={16} /> />
        <Barcode
          label="Product Barcode"
          name="barcode"
          helperText="Scan or enter a barcode"
          barcodeIcon=<BarcodeIcon size={18} />
          scanIcon=<CameraIcon size={18} />
          stopIcon=<XIcon size={18} />
        />
        <Geolocation
          label="Location"
          name="location"
          helperText="Set your coordinates"
          locationIcon=<NavigationArrowIcon size={16} />
        />

        <Separator />
        <H3>Display</H3>
        <Progress
          label="Profile Completion"
          name="completion"
          form={form as unknown as AnyFormApi}
          helperText="Your profile progress"
        />

        <Separator />
        <Button action="submit">Submit All Fields</Button>
      </YStack>
    </Form>
  );
};
AllFieldsShortLists.parameters = {
  docs: {
    description: {
      story:
        "Same as All Fields but with short option lists (no scroll). Tests dropdown shrink-to-fit when content doesn't fill the viewport.",
    },
  },
};
