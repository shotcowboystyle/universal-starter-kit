declare module 'webpack-node-externals' {
  interface NodeExternalsOptions {
    allowlist?: (string | RegExp)[];
    additionalModuleDirs?: string[];
    importType?: string;
    modulesDir?: string;
  }

  type NodeExternals = (
    data: { context?: string; request?: string },
    callback: (error?: Error, result?: string) => void,
  ) => void;

  const nodeExternals: (options?: NodeExternalsOptions) => NodeExternals;
  export default nodeExternals;
}
