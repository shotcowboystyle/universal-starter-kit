// GNOME (GTK4 / GJS / libadwaita) entry for __NAME__.
//
// Renders the home screen inside a real Adw.ApplicationWindow via
// react-gnome. Every box you see is an actual GTK widget laid out by Yoga
// — there is no webview and no DOM.
//
//   pnpm gnome           interactive window
//   pnpm gnome:capture   render, save a PNG, quit (works headless)
//   gjs -m dist/gnome/main.js [outPath|interactive]
//
// ONE'S ROUTER IS NOT MOUNTED. Its native path goes through
// react-native-screens, which needs the RN fabric renderer that does not
// exist here. The index route's component is imported directly, and
// gnome/shims/one.ts backs the router API the screens call. Give this
// entry an Adw.NavigationView host when you want real push/pop.
//
// PROVIDERS. Only what the home screen consumes: Tamagui with the app's
// real config, and i18next with the app's real resources. Add others as
// screens need them — a provider whose graph reaches the DOM will fail at
// module init, not at render.

// Browser-API polyfills FIRST. Tamagui and RN-shaped dependencies probe
// window/document/matchMedia at module-init time, and imports are hoisted
// — first-import order is what guarantees the globals exist by then.
import './polyfills';
import 'gi://Gtk?version=4.0';
import 'gi://Adw?version=1';

import { HomeScreen } from '@features/__NAME__';
import { resources } from '@package/i18n/resources';
import {
  AdwApplicationWindowElement,
  AdwHeaderBar,
  ToolbarView,
  loadYogaForGjs,
  render,
  setYoga,
} from '@react-gnome/renderer';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';

import { config } from '../config/tamagui.config';

import { TamaguiProvider } from './tamagui-barrel';

declare const ARGV: string[];
declare const imports: { system: { exit(code: number): void } };

// initImmediate:false makes init synchronous — resources are bundled, so
// useTranslation must not suspend on first render.
i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  defaultNS: 'common',
  ns: ['common'],
  fallbackLng: 'en',
  lng: 'en',
  resources,
  interpolation: { escapeValue: false },
  initImmediate: false,
});

const arg0 = ARGV === undefined ? undefined : ARGV[0];
const interactive = arg0 === 'interactive' || arg0 === 'i';
const outPath = !interactive && arg0 ? arg0 : '/tmp/__NAME__-gnome.png';

Gtk.init();
setYoga(await loadYogaForGjs());

function GnomeApp(): React.ReactElement {
  return (
    <TamaguiProvider
      config={config}
      defaultTheme="light">
      <React.Suspense fallback={null}>
        <HomeScreen />
      </React.Suspense>
    </TamaguiProvider>
  );
}

const app = new Adw.Application({ applicationId: 'one.multiplatform.__NAME_APPID__', flags: 0 });

app.connect('activate', () => {
  // RGN_WIDTH/RGN_HEIGHT override the window size (same family as
  // RGN_WAIT) so headless captures at other geometries need no rebuild.
  const window = new AdwApplicationWindowElement({
    title: '__NAME_PASCAL__',
    application: app,
    defaultWidth: Number.parseInt(GLib.getenv('RGN_WIDTH') ?? '900', 10),
    defaultHeight: Number.parseInt(GLib.getenv('RGN_HEIGHT') ?? '640', 10),
  });

  render(
    <ToolbarView>
      <AdwHeaderBar toolbarSlot="top" />
      <GnomeApp />
    </ToolbarView>,
    window,
  );
  window.widget.present();

  if (interactive) {
    return;
  }

  // Headless capture. A render node is transiently null on offscreen
  // surfaces right after an invalidation, so poll across frames rather
  // than trusting one fixed delay — a single timeout yields a blank PNG
  // often enough to be useless as evidence.
  const dir = outPath.substring(0, outPath.lastIndexOf('/')) || '.';
  GLib.mkdir_with_parents(dir, 0o755);
  const wait = Number.parseInt(GLib.getenv('RGN_WAIT') ?? '800', 10);
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, () => {
    const { widget } = window;
    const { WidgetPaintable } = Gtk as unknown as { WidgetPaintable: { new: (w: Gtk.Widget) => unknown } };
    let tries = 0;
    const poll = (): boolean => {
      try {
        const width = widget.get_width();
        const height = widget.get_height();
        if (width > 0 && height > 0) {
          const paintable = WidgetPaintable.new(widget) as {
            snapshot(s: Gtk.Snapshot, w: number, h: number): void;
          };
          const snapshot = new Gtk.Snapshot();
          paintable.snapshot(snapshot, width, height);
          const node = snapshot.to_node();
          if (node) {
            const renderer = widget.get_native()?.get_renderer();
            if (!renderer) {
              throw new Error('no Gsk.Renderer attached to the window');
            }
            const viewport = new Graphene.Rect();
            viewport.init(0, 0, width, height);
            renderer.render_texture(node, viewport).save_to_png(outPath);
            console.log(`captured ${width}x${height} -> ${outPath}`);
            app.quit();
            return GLib.SOURCE_REMOVE;
          }
        }
        if (++tries >= 80) {
          console.error(`snapshot produced no render node after ${tries} frames`);
          app.quit();
          imports.system.exit(4);
          return GLib.SOURCE_REMOVE;
        }
        widget.queue_draw();
        return GLib.SOURCE_CONTINUE;
      } catch (error) {
        console.error(`snapshot failed: ${String(error)}`);
        app.quit();
        imports.system.exit(5);
        return GLib.SOURCE_REMOVE;
      }
    };
    if (poll() !== GLib.SOURCE_REMOVE) {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, poll);
    }
    return GLib.SOURCE_REMOVE;
  });
});

app.run([]);
