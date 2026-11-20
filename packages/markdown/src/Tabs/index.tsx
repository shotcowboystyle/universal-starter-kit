/**
 * MDX doc tabs.
 *
 * LC-16 wrapper over the canonical `Tabs` from
 * `@repo/ui` (tamagui tablist/tab/tabpanel aria, roving
 * focus, knob-scaled underline variant) instead of the previous hand-rolled
 * strip. This file only owns the MDX-facing API: parallel `items` (labels)
 * and `children` (panels) arrays, with `defaultValue` addressing a label.
 */

import { Tabs } from '@repo/ui';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';

export interface MDXTabsProps {
  items: string[];
  children: ReactNode[];
  defaultValue?: string;
}

export const MDXTabs = ({ items, children, defaultValue }: MDXTabsProps) => {
  const childArray = Array.isArray(children) ? children : [children];
  // Doc labels may repeat; index-suffixed values keep tab identity unique.
  const values = items.map((label, index) => `${label}-${index}`);
  const defaultIndex = defaultValue === undefined ? 0 : Math.max(items.indexOf(defaultValue), 0);

  return (
    <YStack marginVertical="$4">
      <Tabs
        items={items.map((label, index) => ({
          value: values[index],
          label,
          // Panels mount on first visit and stay mounted (lazyMount), so
          // focus/input state inside a visited panel survives switching.
          content: childArray[index] ?? null,
        }))}
        defaultValue={values[defaultIndex]}
        lazyMount
      />
    </YStack>
  );
};

export interface MDXTabProps {
  children: ReactNode;
}

export const MDXTab = ({ children }: MDXTabProps) => <YStack>{children}</YStack>;
