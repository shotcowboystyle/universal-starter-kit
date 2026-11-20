export interface PathsApi {
  getAppPath: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
  join: (...segments: string[]) => Promise<string>;
  resolve: (...segments: string[]) => Promise<string>;
  dirname: (path: string) => Promise<string>;
}

// Default web implementation (no-op)
export const paths: PathsApi = {
  async getAppPath() {
    return '/';
  },
  async getPath(_name: string) {
    return '/';
  },
  async join(...segments: string[]) {
    return segments.join('/');
  },
  async resolve(...segments: string[]) {
    return segments.join('/');
  },
  async dirname(path: string) {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
  },
};
