/** TenTap 1.x embeds CSS in a JavaScript template literal without escaping it. */
export function escapeNativeEditorCSS(css: string): string {
  return css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}
