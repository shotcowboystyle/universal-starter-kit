export function openUrl(url: string, target = '_blank'): void {
  window.open(url, target, 'noopener,noreferrer');
}
