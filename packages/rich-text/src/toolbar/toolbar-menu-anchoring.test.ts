import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// MPO-35 ruling B (Clay, 2026-09-26): toolbar menus are input-anchored. Each
// one drops flush below its trigger and starts at the trigger's left edge, so
// a menu never covers the toolbar being worked in and never centers itself
// off to one side. The selection and block bubbles are their own lineage and
// are not held to this.
const here = import.meta.dirname;
const toolbarMenus: [file: string, menus: number][] = [
  ['ColorPicker.tsx', 2],
  ['HeadingPicker.tsx', 1],
  ['ImageDialog.tsx', 1],
  ['LinkDialog.tsx', 1],
  ['ListPicker.tsx', 1],
  ['MoreDropdown.tsx', 1],
];
const MENU_PLACEMENT = /<(?:Popover|DropdownMenu)\b[^>]*placement="(?<placement>[^"]+)"/gu;

describe('rich-text toolbar menus open input-anchored (MPO-35)', () => {
  it.each(toolbarMenus)('%s: every menu opens bottom-start', (file, menus) => {
    const src = readFileSync(path.join(here, file), 'utf-8');
    const placements = [...src.matchAll(MENU_PLACEMENT)].map((match) => match.groups?.placement);
    expect(placements).toHaveLength(menus);
    expect(placements.every((placement) => placement === 'bottom-start')).toBe(true);
  });
});
