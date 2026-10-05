import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Package subtrees that consumers deep-import but the publisher never declared
 * in its `exports` map.
 *
 * `one`'s `fork/SSRNavigationContainer` (every dist flavour plus its source)
 * imports three `@react-navigation/core` internals:
 *
 *   @react-navigation/core/lib/module/NavigationBuilderContext
 *   @react-navigation/core/lib/module/NavigationStateContext
 *   @react-navigation/core/lib/module/EnsureSingleNavigator
 *
 * The published package exports only "." and "./package.json", so those are
 * undeclared subpaths of a bare specifier — Node rejects them with
 * ERR_PACKAGE_PATH_NOT_EXPORTED and Rolldown (Vite 8) rejects them at build
 * time. Both are behaving correctly; the deep imports are the bug.
 *
 * vxrn papers over it by rewriting the dependency's package.json in place
 * (`vxrn` builtInDepPatches, which leaves a package.json.vxrn.original behind),
 * but that only runs when something invokes vxrn — never during a plain
 * `vite build` or `storybook build`, and never on a fresh CI install. Mapping
 * the subtree to its real directory resolves those files by path, which is
 * exactly where the missing exports entries would have pointed.
 */
const UNEXPORTED_SUBTREES: readonly string[] = ['@react-navigation/core/lib/module'];

/**
 * Vite `resolve.alias` entries that let known-undeclared package internals
 * resolve by filesystem path.
 *
 * Scoped to one subtree of one package: Vite alias keys match the whole
 * specifier or a `key + "/"` prefix, so sibling paths (`lib/moduleOther`) and
 * the package's own entry (`@react-navigation/core`) keep going through the
 * `exports` map. Nothing here disables exports enforcement globally.
 *
 * Entries are omitted when the package (or the target directory) is absent, so
 * consumers that do not install `one`/react-navigation are unaffected.
 *
 * @param root Directory whose `node_modules` the packages resolve from.
 */
export function unexportedDepAliases(root: string = process.cwd()): Record<string, string> {
  const aliases: Record<string, string> = {};
  const requireFrom = createRequire(path.join(root, 'package.json'));

  for (const specifier of UNEXPORTED_SUBTREES) {
    const [pkgName, subpath] = splitPackageSubpath(specifier);
    const pkgDir = resolvePackageDir(pkgName, root, requireFrom);
    if (!pkgDir) {
      continue;
    }
    const target = path.join(pkgDir, subpath);
    if (fs.existsSync(target)) {
      aliases[specifier] = target;
    }
  }

  return aliases;
}

function splitPackageSubpath(specifier: string): [pkgName: string, subpath: string] {
  const segments = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  return [segments.slice(0, nameLength).join('/'), segments.slice(nameLength).join('/')];
}

function resolvePackageDir(pkgName: string, root: string, requireFrom: NodeRequire): string | undefined {
  try {
    return path.dirname(requireFrom.resolve(`${pkgName}/package.json`));
  } catch {
    // Packages that don't export "./package.json" can't be resolved that way.
    const hoisted = path.join(root, 'node_modules', ...pkgName.split('/'));
    return fs.existsSync(path.join(hoisted, 'package.json')) ? hoisted : undefined;
  }
}
