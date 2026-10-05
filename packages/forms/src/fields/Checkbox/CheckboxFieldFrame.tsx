import { Checkbox as TamaguiCheckbox, styled } from 'tamagui';

import { useFieldDescribedBy } from '../../fieldLayout';

/** Hit-target frame. The painted box is CheckboxGlyphBox. */
const CheckboxFieldFrameBase = styled(TamaguiCheckbox, {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 0,
  outlineWidth: 0,
  hoverStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  pressStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  focusStyle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  focusVisibleStyle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  activeStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

export const CheckboxFieldFrame = CheckboxFieldFrameBase.styleable((props, ref) => (
  <CheckboxFieldFrameBase aria-describedby={useFieldDescribedBy()} {...props} ref={ref} />
));
