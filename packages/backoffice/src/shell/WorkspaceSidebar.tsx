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
import { ScrollView, Separator, SizableText, Spinner, XStack, YStack } from '@repo/ui';
import type { SidebarItem, SidebarSection } from '@repo/ui';
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  hairline,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { BackofficePaths } from '../navigation/paths';

import { useWorkspaces } from './useWorkspaces';
import type { WorkspaceDoc } from './useWorkspaces';
import { workspaceIcon } from './workspaceIcons';

export const WORKSPACE_SIDEBAR_WIDTH = 250;

export interface WorkspaceSidebarProps {
  /** Current path, used to highlight the active workspace. */
  activePath?: string;
  /** Called with the target path when a workspace is selected. */
  onNavigate?: (path: string) => void;
}

function workspaceItem(
  workspace: WorkspaceDoc,
  depth: number,
  paths: BackofficePaths,
  activePath: string | undefined,
  onNavigate: ((path: string) => void) | undefined,
): SidebarItem {
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
}

/** Flatten a workspace tree into indented sidebar items (children follow parents). */
function flattenTree(
  roots: WorkspaceDoc[],
  childrenByParent: Map<string, WorkspaceDoc[]>,
  paths: BackofficePaths,
  activePath: string | undefined,
  onNavigate: ((path: string) => void) | undefined,
  depth = 0,
): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const workspace of roots) {
    items.push(workspaceItem(workspace, depth, paths, activePath, onNavigate));
    const children = childrenByParent.get(workspace.name);
    if (children?.length) {
      items.push(...flattenTree(children, childrenByParent, paths, activePath, onNavigate, depth + 1));
    }
  }
  return items;
}

function NavRow({ item, position }: { item: SidebarItem; position: ReturnType<typeof getGroupPosition> }) {
  const { knobProps } = useResolvedKnobs();
  const onAccent = useReadableTextOn('$accentBackground');
  const rowPad = knobProps.panelPadding.padding;
  const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
  const ink = item.active && onAccent ? onAccent : undefined;
  return (
    <XStack
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
      backgroundColor={item.active ? '$accentBackground' : 'transparent'}
      hoverStyle={{
        backgroundColor: item.active ? '$accentBackground' : '$color3',
        ...corners,
      }}
      pressStyle={{
        backgroundColor: item.active ? '$accentBackground' : '$color4',
        ...corners,
      }}
      cursor={item.onPress ? 'pointer' : 'default'}
      onPress={item.onPress}
      tabIndex={item.onPress ? 0 : undefined}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({
        outlineOffset: -2,
        outlineColor: ink ?? '$outlineColor',
      })}
      onKeyDown={
        ((e: { key?: string; preventDefault?: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault?.();
            item.onPress?.();
          }
        }) as unknown as () => void
      }>
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
}

function WorkspaceNav({ sections }: { sections: SidebarSection[] }) {
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
              {section.title ? (
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
                    <YStack key={String(item.value ?? item.label)}>
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
}

export function WorkspaceSidebar({ activePath, onNavigate }: WorkspaceSidebarProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const paths = useBackofficePaths();
  const { privateWorkspaces, publicRoots, childrenByParent, isLoading } = useWorkspaces();

  const sections = useMemo<SidebarSection[]>(() => {
    const result: SidebarSection[] = [];
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
      result[0] = { ...result[0], title: undefined };
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
}
