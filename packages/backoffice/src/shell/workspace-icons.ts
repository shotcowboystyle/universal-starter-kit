/**
 * Best-effort map from frappe desk icon names (Workspace.icon holds symbols
 * from frappe's timeless icon sprite) to @phosphor-icons/react equivalents.
 * Unknown names fall back to a generic workspace glyph.
 */
import {
  BuildingsIcon,
  CalculatorIcon,
  CalendarIcon,
  ChatCircleIcon,
  CoinsIcon,
  EnvelopeIcon,
  FactoryIcon,
  FileIcon,
  FirstAidKitIcon,
  GaugeIcon,
  GearIcon,
  GlobeIcon,
  GraduationCapIcon,
  HammerIcon,
  HandshakeIcon,
  HeartIcon,
  IdentificationCardIcon,
  ImageIcon,
  KanbanIcon,
  LifebuoyIcon,
  PackageIcon,
  PlantIcon,
  PlugsConnectedIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  ShoppingCartIcon,
  SquaresFourIcon,
  StorefrontIcon,
  UsersIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

const FRAPPE_ICON_MAP = new Map<string, Icon>(
  Object.entries({
    accounting: CalculatorIcon,
    agriculture: PlantIcon,
    assets: BuildingsIcon,
    buying: ShoppingCartIcon,
    calendar: CalendarIcon,
    chat: ChatCircleIcon,
    crm: HandshakeIcon,
    dashboard: GaugeIcon,
    education: GraduationCapIcon,
    email: EnvelopeIcon,
    file: FileIcon,
    'getting-started': RocketLaunchIcon,
    healthcare: FirstAidKitIcon,
    hr: IdentificationCardIcon,
    'image-view': ImageIcon,
    integration: PlugsConnectedIcon,
    build: HammerIcon,
    developer: HammerIcon,
    customize: GearIcon,
    manufacturing: FactoryIcon,
    'money-coins-1': CoinsIcon,
    'non-profit': HeartIcon,
    organization: BuildingsIcon,
    project: KanbanIcon,
    quality: SealCheckIcon,
    retail: StorefrontIcon,
    selling: StorefrontIcon,
    setting: GearIcon,
    settings: GearIcon,
    stock: PackageIcon,
    support: LifebuoyIcon,
    tool: WrenchIcon,
    users: UsersIcon,
    website: GlobeIcon,
  }),
);

/** Resolve a frappe workspace icon name to a phosphor icon component. */
export const workspaceIcon = (icon?: string, workspaceName?: string): Icon => {
  // Tools and Build both often ship the desk sprite name `tool`. Disambiguate
  // by workspace name so they don't share a wrench.
  const genericIcon = icon === undefined || icon === '' || icon === 'tool';
  if (genericIcon && workspaceName !== undefined && /build/iu.test(workspaceName)) {
    return HammerIcon;
  }
  const keys = [icon, workspaceName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replaceAll(/\s+/gu, '-'));
  for (const key of keys) {
    const match = FRAPPE_ICON_MAP.get(key);
    if (match !== undefined) {
      return match;
    }
  }
  return SquaresFourIcon;
};
