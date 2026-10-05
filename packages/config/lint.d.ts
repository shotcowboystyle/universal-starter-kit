export interface ConventionRoots {
  root?: string;
  apps?: string;
  features?: string;
  public?: string;
  packages?: string;
}

export interface RunConventionChecksOptions {
  roots?: ConventionRoots;
}

export function resolveRoots(roots?: ConventionRoots): {
  root: string;
  apps: string;
  features: string;
  public: string;
  packages: string;
};

export function runConventionChecks(options?: RunConventionChecksOptions): number;

export interface SizeRecipeEscapeSite {
  line: number;
  form: 'prop' | 'call' | 'comment';
  reason: string | undefined;
}

export function findSizeRecipeEscapes(src: string): SizeRecipeEscapeSite[];
