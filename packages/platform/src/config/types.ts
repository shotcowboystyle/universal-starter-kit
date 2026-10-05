export interface IConfig {
  add: (value: Record<string, string>) => Record<string, string>;
  get: (key?: string) => Record<string, string> | string | undefined;
  remove: (key: string) => string | undefined;
  set: (key: string, value: string) => string;
}
