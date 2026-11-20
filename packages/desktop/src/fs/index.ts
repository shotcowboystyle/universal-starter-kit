export interface FsApi {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  remove: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  copyFile: (src: string, dst: string) => Promise<void>;
}

const NO_FS = 'File system not available in browser';

// Default web implementation (no file system access)
export const fs: FsApi = {
  async readTextFile(_path: string): Promise<string> {
    throw new Error(NO_FS);
  },
  async writeTextFile(_path: string, _contents: string): Promise<void> {
    throw new Error(NO_FS);
  },
  async exists(_path: string): Promise<boolean> {
    throw new Error(NO_FS);
  },
  async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    throw new Error(NO_FS);
  },
  async remove(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    throw new Error(NO_FS);
  },
  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error(NO_FS);
  },
  async copyFile(_src: string, _dst: string): Promise<void> {
    throw new Error(NO_FS);
  },
};
