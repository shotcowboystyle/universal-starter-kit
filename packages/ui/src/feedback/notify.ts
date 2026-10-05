/**
 * Semantic `notify()` — severity × scope × blocking → toast / banner / alert / dialog.
 *
 * Mount `<NotifyHost />` once (app root / story) so banners and dialogs render.
 * Inline `alert` surfaces need a `<NotifyRegion scope="section"|"field" />`
 * near the relevant content. Toast still needs `<ToastViewport />` (included
 * in NotifyHost by default).
 */

import { showToast } from '../Toast/store';

import { routeNotify, type NotifyEvent, type NotifyRoute } from './route';
import { pushFeedback } from './store';

export type { NotifyEvent, NotifyRoute };

function toastTitle(route: NotifyRoute): { title: string; description?: string } {
  // Success path is a one-liner toast: prefer title, else body.
  if (route.title) {
    return { title: route.title, description: route.body };
  }
  return { title: route.body };
}

/**
 * Route a semantic feedback event and deliver it to the matching surface.
 * Returns the route decision (useful for tests / debugging).
 */
export function notify(event: NotifyEvent): NotifyRoute {
  const route = routeNotify(event);

  if (route.surface === 'toast') {
    const { title, description } = toastTitle(route);
    showToast({
      title,
      description,
      intent: route.toastIntent,
      duration: route.duration,
      action: route.action,
      dismissible: route.dismissible,
    });
    return route;
  }

  pushFeedback({
    surface: route.surface,
    severity: route.severity,
    scope: route.scope,
    region: route.region,
    title: route.title,
    body: route.body,
    action: route.action,
    dismissible: route.dismissible,
  });
  return route;
}
