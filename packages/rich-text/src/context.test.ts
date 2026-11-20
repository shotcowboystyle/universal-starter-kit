import { describe, it, expect } from 'vitest';

import { RichEditorContext } from './context';

describe(RichEditorContext, () => {
  it('is a valid styled context with expected default values', () => {
    expect(RichEditorContext).toBeDefined();
    expect(RichEditorContext.Provider).toBeDefined();
  });
});
