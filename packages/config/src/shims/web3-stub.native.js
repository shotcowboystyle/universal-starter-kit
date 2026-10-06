/**
 * No-op `@multiplatform.one/web3(/native)` shim for NATIVE runs.
 *
 * The core package's loadWalletProvider.native.ts lazily
 * `import("@multiplatform.one/web3/native")` — an OPTIONAL package many apps
 * do not install. vxrn's rolldown native bundler leaves the unresolvable
 * specifier as a bare dynamic `import()` expression in the classic-script
 * bundle, which Hermes rejects at lazy-compile time with "SyntaxError:
 * Invalid expression encountered", killing the root _layout route.
 * createViteConfig's registerNativeWeb3Stub redirects the specifier here so
 * the import inlines and parses; it auto-skips when web3 is installed.
 *
 * Plain JS (not TS): vxrn's native pipeline does not transform node_modules
 * TypeScript.
 */
export function WalletProvider({ children }) {
  return children ?? null;
}
