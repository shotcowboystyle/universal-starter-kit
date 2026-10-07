import type { ExtensionContext } from 'vscode';
import { commands } from 'vscode';

import { MainPanel } from './views/panel';

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('__NAME__.showApp', async () => {
      MainPanel.render(context);
    }),
  );
}

export function deactivate() {}
