/** TenTap 1.x embeds CSS in a JavaScript template literal without escaping it. */
export const escapeNativeEditorCSS = (css: string): string =>
  css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
