import {
  ChatCircleIcon,
  CheckSquareIcon,
  CreditCardIcon,
  FolderIcon,
  GearIcon,
  SquaresFourIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import { Sidebar } from './Sidebar';

export default {
  title: 'Components/Sidebar',
  component: Sidebar,
  parameters: { status: { type: 'stable' } },
};

export const Default = () => {
  // Demo app frame rides the outer-radius knob (G-15 story honesty): the
  // pinned $3 held a 7px arc at borderRadius:none (UX-P06).
  const { knobProps } = useResolvedKnobs();
  const [active, setActive] = useState('dashboard');
  const item = (value: string, label: string, extras: { count?: number; icon?: ReactNode } = {}) => ({
    label,
    value,
    active: active === value,
    onPress: () => {
      setActive(value);
    },
    ...extras,
  });
  return (
    <XStack height={320} borderWidth={1} borderColor="$borderColor" {...knobProps.borderRadiusNested} overflow="hidden">
      <Sidebar
        sections={[
          {
            title: 'Navigation',
            items: [
              item('dashboard', 'Dashboard', { icon: <SquaresFourIcon size={18} /> }),
              item('projects', 'Projects', { count: 5, icon: <FolderIcon size={18} /> }),
              item('tasks', 'Tasks', { count: 12, icon: <CheckSquareIcon size={18} /> }),
              item('messages', 'Messages', { count: 3, icon: <ChatCircleIcon size={18} /> }),
            ],
          },
          {
            title: 'Settings',
            items: [
              item('profile', 'Profile', { icon: <UserIcon size={18} /> }),
              item('preferences', 'Preferences', { icon: <GearIcon size={18} /> }),
              item('billing', 'Billing', { icon: <CreditCardIcon size={18} /> }),
            ],
          },
        ]}
      />
      <YStack flex={1} padding="$4" justifyContent="center" alignItems="center">
        <Paragraph color="$color10">Main content area</Paragraph>
      </YStack>
    </XStack>
  );
};
Default.storyName = 'Main';
