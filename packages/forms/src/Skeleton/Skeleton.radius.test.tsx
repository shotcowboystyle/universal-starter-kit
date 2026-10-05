import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Skeleton } from './index';

afterEach(cleanup);

function textBoneRadius(borderRadius: 'none' | 'small' | 'large' | 'full') {
  const { container } = renderWithProviders(
    <Preset overrides={{ borderRadius }}>
      <Skeleton variant="text" width={120} />
    </Preset>,
  );
  const bone = container.querySelector('.is_Skeleton') as HTMLElement;
  const atoms = String(bone.className)
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
  cleanup();
  return atoms;
}

describe('Skeleton text bones ride DEFAULT', () => {
  it('takes the token at every stop, square at none', () => {
    expect(textBoneRadius('none')).toEqual(['_btlr-t-radius-0']);
    expect(textBoneRadius('small')).toEqual(['_btlr-t-radius-2']);
    expect(textBoneRadius('large')).toEqual(['_btlr-t-radius-6']);
    expect(textBoneRadius('full')).toEqual(['_btlr-t-radius-12']);
  });
});
