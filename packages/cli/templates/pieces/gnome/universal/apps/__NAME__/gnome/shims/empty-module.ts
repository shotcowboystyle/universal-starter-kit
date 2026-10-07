// Stub for real-RN Flow internals and the expo surface, wired up by
// vite.config.gnome.ts's stubRnLibraries plugin.
//
// Two ways they reach the graph: a dependency deep-imports
// `react-native/Libraries/...` (slipping past the package-root alias),
// and expo modules arrive through accidental native-condition resolution.
// Neither has a GJS implementation, and RN's Flow sources cannot be
// parsed by the bundler at all.
//
// The named exports exist so a destructuring import resolves rather than
// throwing at module init — the call sites are all on paths this target
// does not take.

export default {};
export const get = () => null;
export const Platform = {
  OS: 'linux',
  select: (o: Record<string, unknown>) => o.default ?? o.native,
};
export const NativeEventEmitter = class NativeEventEmitter {};
export const EventEmitter = class EventEmitter {};
export const NativeModule = class NativeModule {};
export const SharedObject = class SharedObject {};
export const SharedRef = class SharedRef {};
export const CodedError = class CodedError extends Error {};
export const UnavailabilityError = class UnavailabilityError extends Error {};
export const requireNativeModule = () => ({});
export const requireNativeViewManager = () => null;
