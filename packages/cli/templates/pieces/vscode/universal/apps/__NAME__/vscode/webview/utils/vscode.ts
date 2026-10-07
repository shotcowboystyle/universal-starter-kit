// `acquireVsCodeApi` is injected by the VS Code webview host. When the
// webview is opened directly in a browser (dev preview), it doesn't exist —
// fall back to a noop stub so the page can still render.
declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
};

const stub = {
  postMessage: () => {},
  setState: () => {},
  getState: () => {},
};

export const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : stub;
