import { describe, expect, it } from 'vitest';

import { cleanPastedHtml, isOfficeHtml } from './paste-cleanup';

const GOOGLE_DOCS_HTML =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc123">' +
  '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">' +
  '<span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;' +
  'font-weight:400;font-style:normal;">Hello from Docs</span></p>' +
  '<p dir="ltr"><span style="font-weight:700;color:#ff0000;">Red bold</span></p></b>';

const WORD_HTML =
  "<html xmlns:o='urn:schemas-microsoft-com:office:office'><body>" +
  '<!--[if gte mso 9]><xml><o:shapedefaults/></xml><![endif]-->' +
  '<p class="MsoNormal" style="mso-margin-top-alt:auto;color:windowtext;">Hello from Word<o:p></o:p></p>' +
  '</body></html>';

describe(isOfficeHtml, () => {
  it('detects Google Docs clipboard payloads', () => {
    expect(isOfficeHtml(GOOGLE_DOCS_HTML)).toBe(true);
  });

  it('detects Microsoft Word clipboard payloads', () => {
    expect(isOfficeHtml(WORD_HTML)).toBe(true);
  });

  it('returns false for regular web HTML', () => {
    expect(isOfficeHtml('<p><strong>plain</strong> web copy</p>')).toBe(false);
  });
});

describe(cleanPastedHtml, () => {
  it('passes non-office HTML through untouched', () => {
    const html = '<p class="keep-me"><strong>web</strong></p>';
    expect(cleanPastedHtml(html)).toBe(html);
  });

  it('unwraps the Google Docs non-bold <b> guid wrapper', () => {
    const cleaned = cleanPastedHtml(GOOGLE_DOCS_HTML);
    // The wrapper <b> is gone so content does not become bold
    expect(cleaned).not.toContain('docs-internal-guid');
    expect(cleaned).not.toMatch(/<b[\s>]/u);
    expect(cleaned).toContain('Hello from Docs');
  });

  it('drops font junk but keeps meaningful colors', () => {
    const cleaned = cleanPastedHtml(GOOGLE_DOCS_HTML);
    expect(cleaned).not.toContain('font-family');
    expect(cleaned).not.toContain('font-size');
    // Default black ink is dropped (stays on theme text color)
    expect(cleaned).not.toContain('#000000');
    // Explicit non-default color survives as data (authored hex preserved)
    expect(cleaned).toContain('color: #ff0000');
  });

  it('keeps span-styled bold (Docs marks bold with font-weight, not <b>)', () => {
    const cleaned = cleanPastedHtml(GOOGLE_DOCS_HTML);
    // Authored bold survives so ProseMirror parses it into a bold mark
    expect(cleaned).toContain('font-weight: 700');
    // The default-weight span (font-weight:400) carries no mark
    expect(cleaned).not.toContain('font-weight: 400');
    expect(cleaned).not.toContain('font-style: normal');
  });

  it('keeps span-styled italic/underline/strike, drops default values', () => {
    const html =
      '<p class="MsoNormal">' +
      '<span style="font-style:italic;">it</span>' +
      '<span style="text-decoration:underline;">un</span>' +
      '<span style="text-decoration:none;">plain</span></p>';
    const cleaned = cleanPastedHtml(html);
    expect(cleaned).toContain('font-style: italic');
    expect(cleaned).toContain('text-decoration: underline');
    expect(cleaned).not.toContain('text-decoration: none');
  });

  it('strips Word Mso classes, o:p tags, and conditional comments', () => {
    const cleaned = cleanPastedHtml(WORD_HTML);
    expect(cleaned).not.toContain('MsoNormal');
    expect(cleaned).not.toContain('mso-');
    expect(cleaned).not.toContain('<o:p>');
    expect(cleaned).not.toContain('[if gte mso');
    expect(cleaned).toContain('Hello from Word');
  });
});
