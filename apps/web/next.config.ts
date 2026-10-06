import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Source-consumed workspace packages built on Tamagui / React Native Web.
const REPO_PACKAGES = [
  '@repo/forms',
  '@repo/i18n',
  '@repo/platform',
  '@repo/router',
  '@repo/store',
  '@repo/table-primitives',
  '@repo/theme',
  '@repo/ui',
];

interface WebpackConfigLike {
  resolve: { fallback?: { fs?: false; path?: false; os?: false } };
}

const nextConfig: NextConfig = {
  transpilePackages: [...REPO_PACKAGES, 'react-native-web'],
  typescript: {
    ignoreBuildErrors: true,
  },
  compiler: {
    relay: {
      src: './',
      artifactDirectory: './__generated__',
      language: 'typescript',
      eagerEsModules: false,
    },
  },
  turbopack: {
    resolveAlias: {
      'react-native': 'react-native-web',
      'react-native-svg': '@tamagui/react-native-svg',
    },
    // `.next.*` picks @repo/router's Next.js variant; `.web.*` the web builds of
    // cross-platform modules.
    resolveExtensions: [
      '.next.tsx',
      '.next.ts',
      '.web.tsx',
      '.web.ts',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.mjs',
      '.json',
    ],
  },
  // enable react compiler will increase build time 30~40%
  reactCompiler: false,
  cacheComponents: true,
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
  // Configure output for Vercel
  output: 'standalone',
  // Ensure public directory is included in the build
  distDir: '.next',
  // Configure static files handling
  images: {
    // Disable image optimization if not needed
    unoptimized: true,
  },
  // Explicitly configure the output directory structure
  webpack: (config: WebpackConfigLike, { isServer }: { isServer: boolean }) => {
    // Ensure public files are properly copied to the output directory
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
