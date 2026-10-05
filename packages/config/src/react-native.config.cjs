'use strict';

const path = require('path');

module.exports = {
  // Pin react-native to its real, resolved location. This monorepo uses
  // pnpm `node-linker=hoisted`, so react-native lives in the repo-root
  // node_modules, not <app>/node_modules. @react-native-community/cli's
  // autolinking defaults reactNativePath to "<project>/node_modules/react-native",
  // which is empty here and breaks CocoaPods ("Couldn't find react-native
  // package.json"). Resolving it explicitly points the Podfile at the hoisted copy.
  reactNativePath: path.dirname(require.resolve('react-native/package.json')),
  commands: [...require('vxrn/react-native-commands')],
};
