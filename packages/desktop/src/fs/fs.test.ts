import { describe, expect, it } from 'vitest';

import { fs } from './index';

describe('fs web stubs', () => {
  it('readTextFile throws with browser error', async () => {
    await expect(fs.readTextFile('/path')).rejects.toThrow('File system not available in browser');
  });

  it('writeTextFile throws with browser error', async () => {
    await expect(fs.writeTextFile('/path', 'data')).rejects.toThrow('File system not available in browser');
  });

  it('exists throws with browser error', async () => {
    await expect(fs.exists('/path')).rejects.toThrow('File system not available in browser');
  });

  it('mkdir throws with browser error', async () => {
    await expect(fs.mkdir('/path')).rejects.toThrow('File system not available in browser');
  });

  it('remove throws with browser error', async () => {
    await expect(fs.remove('/path')).rejects.toThrow('File system not available in browser');
  });

  it('rename throws with browser error', async () => {
    await expect(fs.rename('/old', '/new')).rejects.toThrow('File system not available in browser');
  });

  it('copyFile throws with browser error', async () => {
    await expect(fs.copyFile('/src', '/dst')).rejects.toThrow('File system not available in browser');
  });
});
