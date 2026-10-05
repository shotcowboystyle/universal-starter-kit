import { isWeb } from '@repo/platform';
import { forwardRef, type ComponentProps, type ComponentRef } from 'react';
import { Collapsible as TamaguiCollapsible, withStaticProperties } from 'tamagui';

export type CollapsibleTriggerProps = ComponentProps<typeof TamaguiCollapsible.Trigger> & {
  /** Web button intent; disclosure controls do not submit forms by default. */
  type?: 'button' | 'submit' | 'reset';
};

const Trigger = TamaguiCollapsible.Trigger.styleable<CollapsibleTriggerProps>(({ type = 'button', ...props }, ref) => (
  <TamaguiCollapsible.Trigger {...(isWeb ? { type } : {})} {...props} ref={ref} />
));

// A separate root keeps Tamagui's shared compound untouched while preserving
// its forwarded ref and content implementation.
export const Collapsible = withStaticProperties(
  forwardRef<ComponentRef<typeof TamaguiCollapsible>, ComponentProps<typeof TamaguiCollapsible>>((props, ref) => (
    <TamaguiCollapsible {...props} ref={ref} />
  )),
  { Trigger, Content: TamaguiCollapsible.Content },
);
