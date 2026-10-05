export interface FontEntry {
  family: string;
  nativeModule?: number;
}

export interface FontLoaderConfig {
  fonts: FontEntry[];
  inter?: boolean;
}

export interface FontLoader {
  importFonts: () => Record<string, number>;
}
