export function downloadFile(_url: string, _filename: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('downloadFile: not supported on native');
  }
}

export function downloadBlob(_blob: Blob, _filename: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('downloadBlob: not supported on native');
  }
}
