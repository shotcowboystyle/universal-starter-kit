import { describe, expect, it } from 'vitest';

import { Icons } from '@/components/layout/icons';

describe('icons', () => {
  it('should export Icons object', () => {
    expect(Icons).toBeDefined();
    expect(Icons).toBeTypeOf('object');
  });

  it('should have projectLogo icon', () => {
    expect(Icons.projectLogo).toBeDefined();
    expect(Icons.projectLogo).toBeTypeOf('object');
  });

  it('should have all expected icon properties', () => {
    const expectedIcons = ['projectLogo'];
    for (const iconName of expectedIcons) {
      expect(Icons).toHaveProperty(iconName);
    }
  });

  it('should be a React component', () => {
    // Icons should be React components from lucide-react
    expect(Icons.projectLogo).toBeDefined();
    expect(Icons.projectLogo).toBeTypeOf('object');
  });
});
