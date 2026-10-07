export interface FsApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dst: string): Promise<void>;
}

// Default web implementation (no file system access)
export const fs: FsApi = {
  async readTextFile(_path: string): Promise<string> {
    throw new Error('File system not available in browser');
  },
  async writeTextFile(_path: string, _contents: string): Promise<void> {
    throw new Error('File system not available in browser');
  },
  async exists(_path: string): Promise<boolean> {
    throw new Error('File system not available in browser');
  },
  async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    throw new Error('File system not available in browser');
  },
  async remove(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    throw new Error('File system not available in browser');
  },
  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error('File system not available in browser');
  },
  async copyFile(_src: string, _dst: string): Promise<void> {
    throw new Error('File system not available in browser');
  },
};
