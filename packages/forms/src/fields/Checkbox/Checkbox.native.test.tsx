import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { CheckedState, Checkbox as TamaguiCheckboxType } from 'tamagui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { Checkbox } from './Checkbox';

import { Checkboxes } from './index';

vi.mock(import('tamagui'), async (importOriginal) => ({
  ...(await importOriginal()),
  isWeb: false,
}));

// On native, tamagui's HOC event branch (@tamagui/web
// eventHandling.native.ts) turns any focus or press handler on a styled layer
// over Checkbox into an `onPress` prop, `undefined` when that layer has no
// press handler, and createCheckbox spreads it over its own toggle. A tap on
// the box then does nothing while the label still works. The web renderer
// here never takes that branch, so the spec pins the handlers that trigger it.
const frameProps = vi.hoisted((): ComponentProps<typeof TamaguiCheckboxType>[] => []);
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the mock swaps a styled component for a recording function, which the module-typed factory cannot express
vi.mock('./CheckboxFieldFrame', async () => {
  const { Checkbox: TamaguiCheckbox } = await vi.importActual<{ Checkbox: typeof TamaguiCheckboxType }>('tamagui');
  return {
    CheckboxFieldFrame: (props: ComponentProps<typeof TamaguiCheckboxType>) => {
      frameProps.push(props);
      return <TamaguiCheckbox {...props} />;
    },
  };
});

const nativeHandlerKeys = [
  'onFocus',
  'onBlur',
  'onHoverIn',
  'onHoverOut',
  'onPress',
  'onPressIn',
  'onPressOut',
  'onLongPress',
];

const handlersOnLastFrame = () => nativeHandlerKeys.filter((key) => key in (frameProps.at(-1) ?? {}));

const FormCheckbox = ({ onChange }: { onChange: (checked: CheckedState) => void }) => {
  const form = useForm({ defaultValues: { terms: false } });
  return (
    <Form form={form}>
      <Checkbox
        name="terms"
        label="Accept terms"
        onChange={onChange}
      />
    </Form>
  );
};

describe('native Checkbox square tap', () => {
  beforeEach(() => {
    frameProps.length = 0;
  });

  it('hands the standalone frame no handler that would clobber the toggle, and a tap toggles once', () => {
    const onChange = vi.fn<(checked: CheckedState) => void>();
    const result = renderWithProviders(
      <Checkbox
        label="Accept terms"
        onChange={onChange}
      />,
    );
    expect(handlersOnLastFrame()).toStrictEqual([]);
    const box = result.getByRole('checkbox');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('hands the form-integrated frame no such handler either', () => {
    const onChange = vi.fn<(checked: CheckedState) => void>();
    const result = renderWithProviders(<FormCheckbox onChange={onChange} />);
    expect(handlersOnLastFrame()).toStrictEqual([]);
    fireEvent.click(result.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('keeps the compound Checkboxes frame free of them too', () => {
    renderWithProviders(
      <Checkboxes
        values={{ email: false }}
        onValuesChange={() => {}}>
        <Checkboxes.FocusGroup>
          <Checkboxes.FocusGroup.Item value="email">
            <Checkboxes.Checkbox aria-label="Email" />
          </Checkboxes.FocusGroup.Item>
        </Checkboxes.FocusGroup>
      </Checkboxes>,
    );
    expect(frameProps.length).toBeGreaterThan(0);
    expect(handlersOnLastFrame()).toStrictEqual([]);
  });
});
