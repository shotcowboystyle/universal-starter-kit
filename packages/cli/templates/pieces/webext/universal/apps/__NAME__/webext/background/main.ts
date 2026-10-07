// MV3 background entry (service worker on chromium, background script on
// firefox) — built as a single-file iife by vite.config.webext-background.ts.
// Extend with runtime messaging / alarms / context menus as the extension
// grows; dev mode reloads it on rebuild when the extension is reloaded.

import browser from 'webextension-polyfill';

browser.runtime.onInstalled.addListener(() => {
  console.info('__NAME__ extension installed');
});
