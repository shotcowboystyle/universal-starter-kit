// The plugin resolves `virtual:vscode` at build time to a module embedding
// the built webview HTML (CSP + nonce + asWebviewUri asset rewriting).
import { getWebviewHtml } from 'virtual:vscode';
import type { ExtensionContext, Webview } from 'vscode';

export class WebviewHelper {
  public static setupHtml(webview: Webview, context: ExtensionContext) {
    return getWebviewHtml(
      process.env.VITE_DEV_SERVER_URL
        ? { serverUrl: process.env.VITE_DEV_SERVER_URL, webview, context }
        : { webview, context },
    );
  }
}
