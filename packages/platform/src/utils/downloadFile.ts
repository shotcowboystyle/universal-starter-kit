export function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, filename);
  } finally {
    // Activation has no completion receipt; keep the URL alive for the browser to read.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }
}
