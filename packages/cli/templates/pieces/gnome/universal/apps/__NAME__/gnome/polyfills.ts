// Browser-API polyfills for the GNOME target. MUST be the first import of
// gnome/main.tsx: JS imports are hoisted, so first-import order is what
// guarantees window/document/matchMedia/URL exist before Tamagui and the
// RN-shaped dependencies probe for them at module-init time.
//
// The implementation is packaged — @react-gnome/react-native/polyfills
// installs each global conditionally, so anything you define before this
// import wins. Keep this file as the app's stable local import point.

import '@react-gnome/react-native/polyfills';
