import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pickerNativeModules } from './nativePickerLoader';

const nodeRequire = createRequire(import.meta.url);

/** Every native module name a package's build asks expo-modules-core for. */
function registeredNativeModules(pkg: string): string[] {
  const build = join(dirname(nodeRequire.resolve(`${pkg}/package.json`)), 'build');
  const names = new Set<string>();
  for (const file of readdirSync(build)) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const source = readFileSync(join(build, file), 'utf8');
    for (const match of source.matchAll(/require(?:Optional)?NativeModule\(\s*['"]([^'"]+)['"]/g)) {
      names.add(match[1]);
    }
  }
  return [...names];
}

// The probe runs before the require, so a name the package never
// registers makes the picker look absent and an image-only field opens the
// Files browser instead of the photo library.
describe('native picker probes', () => {
  it('probe the name expo-image-picker registers', () => {
    expect(registeredNativeModules('expo-image-picker')).toContain(pickerNativeModules.image);
  });

  it('probe the name expo-document-picker registers', () => {
    expect(registeredNativeModules('expo-document-picker')).toContain(pickerNativeModules.document);
  });
});
