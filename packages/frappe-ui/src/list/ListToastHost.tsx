import { Suspense, lazy } from 'react';
import type { ComponentType } from 'react';

// The house ToastViewport rides the @tamagui/toast portal machinery, which
// the curated GNOME components shim omits. Resolve it lazily and check the
// barrel: a target without it renders nothing instead of dragging portals
// into the eager module graph.
const AbsentViewport: ComponentType<object> = () => null;

const ToastViewportLazy = lazy(async () => {
  const components = await import('@repo/ui');
  // SAFETY: widening casts: a curated target's barrel may omit ToastViewport, and the host mounts it without props.
  const Viewport = (components as Partial<typeof components>).ToastViewport as ComponentType<object> | undefined;
  return { default: Viewport ?? AbsentViewport };
});

/**
 * A list page's toast viewport, for its favorites feedback. `showToast`
 * writes to a module store either way; a host without a root viewport (the
 * One app mounts none) would otherwise never paint the entries.
 */
export const ListToastHost = () => (
  <Suspense fallback={null}>
    <ToastViewportLazy />
  </Suspense>
);
