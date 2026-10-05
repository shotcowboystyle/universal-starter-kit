// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { PageSection } from './Page';
import { DetailPageLayout, ListPageLayout, SettingsPageLayout } from './PageTemplates';

function ContentBox({ label, minHeight = 160, grow = true }: { label: string; minHeight?: number; grow?: boolean }) {
  return (
    <YStack
      flex={grow ? 1 : undefined}
      minHeight={minHeight}
      padding="$4"
      backgroundColor="$color3"
      borderWidth={1}
      borderColor="$borderColor"
      justifyContent="center"
      alignItems="center">
      <Paragraph fontWeight="400">{label}</Paragraph>
    </YStack>
  );
}

const meta: Meta<typeof ListPageLayout> = {
  title: 'Components/PageTemplates',
  component: ListPageLayout,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Standard page templates (W11): ListPageLayout / DetailPageLayout / SettingsPageLayout. Thin shells over Screen + PageHeader + canonical scaffolds; breakpoints from theme layout tokens (DG-LAY-01/02), gaps semantic (DG-LAY-03). Density is unpinned on Screen so the density knob restyles the page (LC-76). Field grids (forms' FormGrid) slot into settings content.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ListPageLayout>;

export const ListPage: Story = {
  name: 'Main',
  render: () => (
    <ListPageLayout
      title="Pokemon"
      subtitle="All records in the collection"
      actions={<Button>New</Button>}
      toolbar=<ContentBox label="Filter / search toolbar slot" minHeight={48} grow={false} />>
      <ContentBox label="List content (table / grid) — flex fills the page" minHeight={320} />
    </ListPageLayout>
  ),
};

export const DetailPage: StoryObj<typeof DetailPageLayout> = {
  render: () => (
    <DetailPageLayout
      sizeClass="expanded"
      title="Bulbasaur"
      subtitle="Pokemon · #0001"
      toolbarLeading={<Button>Back</Button>}
      toolbarTrailing={<Button theme="accent">Edit</Button>}
      aside=<ContentBox label="Aside (meta / timeline) ⅓" minHeight={240} />>
      <ContentBox label="Main content ⅔" minHeight={240} />
    </DetailPageLayout>
  ),
};

export const DetailPageCompact: StoryObj<typeof DetailPageLayout> = {
  render: () => (
    <DetailPageLayout
      sizeClass="compact"
      title="Bulbasaur"
      toolbarLeading={<Button>Back</Button>}
      aside=<ContentBox label="Aside — stacked below, never hidden" minHeight={140} />>
      <ContentBox label="Main content" minHeight={200} />
    </DetailPageLayout>
  ),
};

export const SettingsPage: StoryObj<typeof SettingsPageLayout> = {
  render: () => (
    <SettingsPageLayout title="Settings" subtitle="Workspace preferences">
      <PageSection title="Profile" description="Name, avatar, contact details.">
        <ContentBox label="Fields (FormGrid slots here)" minHeight={120} />
      </PageSection>
      <PageSection title="Notifications" description="Choose what you get notified about.">
        <ContentBox label="Fields" minHeight={120} />
      </PageSection>
      <PageSection title="Danger zone" surface>
        <ContentBox label="Destructive actions" minHeight={80} />
      </PageSection>
    </SettingsPageLayout>
  ),
};
