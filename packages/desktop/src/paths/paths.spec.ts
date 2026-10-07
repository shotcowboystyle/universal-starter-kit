import { describe, expect, it } from 'vitest';

import { paths } from './index';

describe('paths web stubs', () => {
  describe('getAppPath', () => {
    it('returns "/"', async () => {
      await expect(paths.getAppPath()).resolves.toBe('/');
    });
  });

  describe('getPath', () => {
    it('returns "/" for any name', async () => {
      await expect(paths.getPath('home')).resolves.toBe('/');
      await expect(paths.getPath('documents')).resolves.toBe('/');
    });
  });

  describe('join', () => {
    it('joins segments with /', async () => {
      await expect(paths.join('a', 'b', 'c')).resolves.toBe('a/b/c');
    });

    it('joins a single segment', async () => {
      await expect(paths.join('only')).resolves.toBe('only');
    });

    it('joins an empty set of segments', async () => {
      await expect(paths.join(',')).resolves.toBe('');
    });

    it('preserves leading slashes', async () => {
      await expect(paths.join('/home', 'user', 'docs')).resolves.toBe('/home/user/docs');
    });
  });

  describe('resolve', () => {
    it('joins segments with / (same as join on web)', async () => {
      await expect(paths.resolve('a', 'b')).resolves.toBe('a/b');
    });

    it('preserves absolute paths', async () => {
      await expect(paths.resolve('/usr', 'local', 'bin')).resolves.toBe('/usr/local/bin');
    });
  });

  describe('dirname', () => {
    it('returns parent directory of a file path', async () => {
      await expect(paths.dirname('/home/user/file.txt')).resolves.toBe('/home/user');
    });

    it('returns parent of a nested path', async () => {
      await expect(paths.dirname('/a/b/c')).resolves.toBe('/a/b');
    });

    it('returns "/" for a root-level file', async () => {
      await expect(paths.dirname('/file.txt')).resolves.toBe('/');
    });

    it('returns "/" for root path', async () => {
      await expect(paths.dirname('/')).resolves.toBe('/');
    });

    it('handles paths without leading slash', async () => {
      await expect(paths.dirname('a/b/c')).resolves.toBe('a/b');
    });

    it('handles a single segment (no slashes)', async () => {
      await expect(paths.dirname('file.txt')).resolves.toBe('/');
    });
  });
});
