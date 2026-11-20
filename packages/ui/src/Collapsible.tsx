import { isWeb } from '@repo/platform';
import { forwardRef } from 'react';
import type { ComponentProps, ComponentRef } from 'react';
import { Collapsible as TamaguiCollapsible, withStaticProperties } from 'tamagui';

export type CollapsibleTriggerProps = ComponentProps<typeof TamaguiCollapsible.Trigger> & {
  /** Web button intent; disclosure controls do not submit forms by default. */
  type?: 'button' | 'submit' | 'reset';
};

const Trigger = TamaguiCollapsible.Trigger.styleable<CollapsibleTriggerProps>(({ type = 'button', ...props }, ref) => (
  <TamaguiCollapsible.Trigger
    {...(isWeb ? { type } : {})}
    {...props}
    ref={ref}
  />
));

// A separate root keeps Tamagui's shared compound untouched while preserving
// its forwarded ref and content implementation.
export const Collapsible = withStaticProperties(
  forwardRef<ComponentRef<typeof TamaguiCollapsible>, ComponentProps<typeof TamaguiCollapsible>>(
    function CollapsibleRoot(props, ref) {
      return (
        <TamaguiCollapsible
          {...props}
          ref={ref}
        />
      );
    },
  ),
  { Trigger, Content: TamaguiCollapsible.Content },
);
