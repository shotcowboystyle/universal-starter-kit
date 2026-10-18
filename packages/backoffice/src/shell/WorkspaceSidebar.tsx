/**
 * Left workspace navigation for the backoffice shell (desk parity).
 *
 * Private workspaces (for_user = session user) on top, public workspaces
 * below ordered by sequence_id, children nested via parent_page (rendered
 * indented under their parent). Data is live via useWorkspaces; paths come
 * from the BackofficeProvider (basePath-aware).
 *
 * LC-72 STACK-OUTER: rows are one stacked group (first/last outer corners,
 * interiors square); hover/press/selection inherit that geometry.
 * LC-71: selected = accent fill; keyboard focus paints an inset ring on the
 * row, never a selection border on every sibling. The column-edge hairline
 * is owned by BackofficeShell so it spans the full rail height (footer
 * included) — this nav paints none.
 */
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  hairline,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import { ScrollView, Separator, SizableText, Spinner, XStack, YStack } from '@repo/ui';
import type { SidebarItem, SidebarSection } from '@repo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { BackofficePaths } from '../navigation/paths';

import { useWorkspaces } from './use-workspaces';
import type { WorkspaceDoc } from './use-workspaces';
import { workspaceIcon } from './workspace-icons';

export const WORKSPACE_SIDEBAR_WIDTH = 250;

/** Sidebar row whose value is always the workspace path. */
interface WorkspaceNavItem extends SidebarItem {
  value: string;
}

interface WorkspaceNavSection extends SidebarSection {
  items: WorkspaceNavItem[];
}

const ACCENT_BACKGROUND = '$accentBackground';

export interface WorkspaceSidebarProps {
  /** Current path, used to highlight the active workspace. */
  activePath?: string;
  /** Called with the target path when a workspace is selected. */
  onNavigate?: (path: string) => void;
}

const workspaceItem = (
  workspace: WorkspaceDoc,
  depth: number,
  paths: BackofficePaths,
  activePath: string | undefined,
  onNavigate: ((path: string) => void) | undefined,
): WorkspaceNavItem => {
  const path = paths.workspace(workspace.name);
  const IconComponent = workspaceIcon(workspace.icon, workspace.name);
  const icon = (
    // Depth-based inset carried by the icon slot — the Sidebar row API has
    // no nesting support, so children indent icon+label via this wrapper.
    <XStack paddingLeft={depth > 0 ? depth * 16 : 0}>
      <IconComponent size={16} />
    </XStack>
  );
  return {
    label: workspace.title ?? workspace.name,
    value: path,
    icon,
    active: activePath === path,
    onPress: onNavigate
      ? () => {
          onNavigate(path);
        }
      : undefined,
  };
};

/** Flatten a workspace tree into indented sidebar items (children follow parents). */
const flattenTree = (
  roots: WorkspaceDoc[],
  childrenByParent: Map<string, WorkspaceDoc[]>,
  paths: BackofficePaths,
  activePath: string | undefined,
  onNavigate: ((path: string) => void) | undefined,
  depth = 0,
): WorkspaceNavItem[] => {
  const items: WorkspaceNavItem[] = [];
  for (const workspace of roots) {
    items.push(workspaceItem(workspace, depth, paths, activePath, onNavigate));
    const children = childrenByParent.get(workspace.name);
    if (children !== undefined && children.length > 0) {
      items.push(...flattenTree(children, childrenByParent, paths, activePath, onNavigate, depth + 1));
    }
  }
  return items;
};

const NavRow = ({ item, position }: { item: WorkspaceNavItem; position: ReturnType<typeof getGroupPosition> }) => {
  const { knobProps } = useResolvedKnobs();
  const onAccent = useReadableTextOn(ACCENT_BACKGROUND);
  const rowPad = knobProps.panelPadding.padding;
  const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
  const ink = item.active && onAccent !== undefined && onAccent !== '' ? onAccent : undefined;
  const handlePress = item.onPress;
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack: `role` also sets the native accessibility role, a tag is web-only
      role="button"
      aria-current={item.active ? 'page' : undefined}
      data-testid="backoffice-workspace-row"
      data-group-position={position}
      data-active={item.active ? 'true' : 'false'}
      alignItems="center"
      gap="$2"
      minHeight={knobProps.sizeToken}
      paddingHorizontal={rowPad}
      paddingVertical="$2"
      overflow="hidden"
      userSelect="none"
      {...corners}
      backgroundColor={item.active ? ACCENT_BACKGROUND : 'transparent'}
      hoverStyle={{
        backgroundColor: item.active ? ACCENT_BACKGROUND : '$color3',
        ...corners,
      }}
      pressStyle={{
        backgroundColor: item.active ? ACCENT_BACKGROUND : '$color4',
        ...corners,
      }}
      cursor={handlePress ? 'pointer' : 'default'}
      onPress={handlePress}
      tabIndex={handlePress ? 0 : undefined}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({
        outlineOffset: -2,
        outlineColor: ink ?? '$outlineColor',
      })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePress?.();
        }
      }}>
      {item.icon}
      <SizableText
        size="$3"
        numberOfLines={1}
        flex={1}
        flexShrink={1}
        fontWeight="400"
        color={ink}>
        {item.label}
      </SizableText>
    </XStack>
  );
};

const WorkspaceNav = ({ sections }: { sections: WorkspaceNavSection[] }) => {
  const { knobProps } = useResolvedKnobs();
  const rowPad = knobProps.panelPadding.padding;
  return (
    <YStack
      width={WORKSPACE_SIDEBAR_WIDTH}
      flex={1}
      height="100%"
      minHeight={0}>
      <ScrollView flex={1}>
        <YStack
          {...knobProps.panelPadding}
          paddingHorizontal={0}
          {...knobProps.gapLg}>
          {sections.map((section, sectionIdx) => (
            <YStack
              key={section.title ?? sectionIdx}
              {...knobProps.gap}>
              {section.title !== undefined && section.title !== '' ? (
                <YStack paddingHorizontal={rowPad}>
                  <SizableText
                    size="$2"
                    fontWeight="400"
                    textTransform="uppercase"
                    color="$color11">
                    {section.title}
                  </SizableText>
                </YStack>
              ) : null}
              <YStack>
                {section.items.map((item, itemIdx) => {
                  const position = getGroupPosition(itemIdx, section.items.length);
                  return (
                    <YStack key={item.value}>
                      {itemIdx > 0 ? <Separator {...hairline.line} /> : null}
                      <NavRow
                        item={item}
                        position={position}
                      />
                    </YStack>
                  );
                })}
              </YStack>
            </YStack>
          ))}
        </YStack>
      </ScrollView>
    </YStack>
  );
};

export const WorkspaceSidebar = ({ activePath, onNavigate }: WorkspaceSidebarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const paths = useBackofficePaths();
  const { privateWorkspaces, publicRoots, childrenByParent, isLoading } = useWorkspaces();

  const sections = useMemo<WorkspaceNavSection[]>(() => {
    const result: WorkspaceNavSection[] = [];
    if (privateWorkspaces.length > 0) {
      result.push({
        title: t('sidebar.private', 'Private'),
        items: privateWorkspaces.map((workspace) => workspaceItem(workspace, 0, paths, activePath, onNavigate)),
      });
    }
    if (publicRoots.length > 0) {
      result.push({
        title: t('sidebar.public', 'Public'),
        items: flattenTree(publicRoots, childrenByParent, paths, activePath, onNavigate),
      });
    }
    // A lone group label is noise (owner-flagged): only caption sections when
    // there is more than one group to distinguish.
    if (result.length === 1) {
      const [only] = result;
      result[0] = { items: only.items };
    }
    return result;
  }, [privateWorkspaces, publicRoots, childrenByParent, paths, activePath, onNavigate, t]);

  if (isLoading && sections.length === 0) {
    return (
      <YStack
        width={WORKSPACE_SIDEBAR_WIDTH}
        flex={1}
        height="100%"
        alignItems="center"
        paddingTop="$6"
        aria-label={t('sidebar.loading', 'Loading workspaces')}>
        <Spinner size="small" />
      </YStack>
    );
  }

  return <WorkspaceNav sections={sections} />;
};
