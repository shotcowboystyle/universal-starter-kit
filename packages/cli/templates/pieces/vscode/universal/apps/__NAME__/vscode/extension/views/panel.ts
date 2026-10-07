import type { Disposable, ExtensionContext, WebviewPanel } from 'vscode';
import { ViewColumn, window } from 'vscode';

import { WebviewHelper } from './helper';

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = WebviewHelper.setupHtml(this._panel.webview, context);
  }

  public static render(context: ExtensionContext) {
    if (MainPanel.currentPanel) {
      MainPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      const panel = window.createWebviewPanel('__NAME__.app', '__NAME_PASCAL__', ViewColumn.One, {
        enableScripts: true,
      });
      MainPanel.currentPanel = new MainPanel(panel, context);
    }
  }

  /** Clean up webview resources when the panel is closed. */
  public dispose() {
    MainPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
