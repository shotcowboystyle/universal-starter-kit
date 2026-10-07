import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// MPO-35 ruling B (Clay, 2026-09-26): toolbar menus are input-anchored. Each
// one drops flush below its trigger and starts at the trigger's left edge, so
// a menu never covers the toolbar being worked in and never centres itself
// off to one side. The selection and block bubbles are their own lineage and
// are not held to this.
const here = import.meta.dirname;
const toolbarMenus = {
  'ColorPicker.tsx': 2,
  'HeadingPicker.tsx': 1,
  'ImageDialog.tsx': 1,
  'LinkDialog.tsx': 1,
  'ListPicker.tsx': 1,
  'MoreDropdown.tsx': 1,
} as const;

describe('rich-text toolbar menus open input-anchored (MPO-35)', () => {
  for (const [file, menus] of Object.entries(toolbarMenus)) {
    it(`${file}: every menu opens bottom-start`, () => {
      const src = readFileSync(join(here, file), 'utf-8');
      const placements = [...src.matchAll(/<(?:Popover|DropdownMenu)\b[^>]*placement="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(placements).toHaveLength(menus);
      expect(placements.every((placement) => placement === 'bottom-start')).toBe(true);
    });
  }
});
