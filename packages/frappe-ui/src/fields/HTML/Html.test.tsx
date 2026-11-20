/**
 * Html field contract specs. The HTML fieldtype is display-only: it takes a
 * server-supplied HTML string and paints it, so the whole contract is
 * (1) what `sanitizeHtml` refuses to let through and (2) what the field shows
 * when there is nothing to paint.
 *
 * The sanitizer is the security surface — a Frappe HTML field carries whatever
 * a desk author typed — so it is asserted directly, tag by tag, rather than
 * through the rendered tree.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { Html, sanitizeHtml } from '.';

/** Registry entries are function components; calling one yields the adapter element. */
type RenderAdapter = (props: FieldRenderProps) => React.ReactElement<React.ComponentProps<typeof Html>>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

describe('HTML field adapter', () => {
  afterEach(cleanup);

  describe(sanitizeHtml, () => {
    it('keeps ordinary formatting markup', () => {
      const out = sanitizeHtml('<p>hello <strong>world</strong> <a href="https://x.test">link</a></p>');
      expect(out).toContain('<strong>world</strong>');
      expect(out).toContain('href="https://x.test"');
    });

    it('drops executable and document-structure tags', () => {
      for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'template']) {
        const out = sanitizeHtml(`<p>keep</p><${tag}>evil</${tag}>`);
        expect(out).toContain('keep');
        expect(out.toLowerCase()).not.toContain(`<${tag}`);
      }
    });

    it('drops interactive form controls', () => {
      const out = sanitizeHtml('<input value="x"><button>go</button><textarea></textarea><select></select>');
      expect(out.toLowerCase()).not.toContain('<input');
      expect(out.toLowerCase()).not.toContain('<button');
      expect(out.toLowerCase()).not.toContain('<textarea');
      expect(out.toLowerCase()).not.toContain('<select');
    });

    it('strips every event-handler attribute and srcdoc', () => {
      const out = sanitizeHtml('<div onclick="steal()" onmouseover="x()" srcdoc="y">text</div>');
      expect(out.toLowerCase()).not.toContain('onclick');
      expect(out.toLowerCase()).not.toContain('onmouseover');
      expect(out.toLowerCase()).not.toContain('srcdoc');
      expect(out).toContain('text');
    });

    it('strips javascript:, vbscript: and data:text/html URIs, keeping the element', () => {
      // oxlint-disable-next-line eslint/no-script-url -- hostile input the sanitizer must strip
      for (const uri of ['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<b>x</b>']) {
        const out = sanitizeHtml(`<a href="${uri}">click</a>`);
        expect(out).toContain('click');
        expect(out.toLowerCase()).not.toContain('href=');
      }
    });

    it('sees through control characters padded into a javascript: URI', () => {
      const padded = `java
script:alert(1)`;
      const out = sanitizeHtml(`<a href="${padded}">click</a>`);
      expect(out.toLowerCase()).not.toContain('href=');
    });

    it('leaves safe URI attributes alone', () => {
      const out = sanitizeHtml('<a href="/desk/app">in-app</a>');
      expect(out).toContain('href="/desk/app"');
    });

    it('removes comments and returns empty string for empty input', () => {
      expect(sanitizeHtml('<!-- secret --><p>a</p>')).not.toContain('secret');
      expect(sanitizeHtml('')).toBe('');
    });

    it('sanitizes nested descendants, not just the top level', () => {
      const out = sanitizeHtml('<div><section><img src="javascript:alert(1)" onerror="x()"></section></div>');
      expect(out.toLowerCase()).not.toContain('onerror');
      // oxlint-disable-next-line eslint/no-script-url -- asserts the hostile scheme is gone
      expect(out.toLowerCase()).not.toContain('javascript:');
    });
  });

  describe('Html field', () => {
    it('paints the sanitized value into the DOM', () => {
      const result = renderWithProviders(
        <Html
          label="Body"
          value='<p id="painted">hello <em>there</em></p>'
        />,
      );
      const painted = result.container.querySelector('#painted');
      expect(painted).toBeTruthy();
      expect(painted?.querySelector('em')?.textContent).toBe('there');
    });

    it('never paints a script the value carried', () => {
      const result = renderWithProviders(
        <Html
          label="Body"
          value="<p>ok</p><script>globalThis.__pwned = 1;</script>"
        />,
      );
      expect(result.container.querySelector('script')).toBeNull();
      expect(result.container.textContent).toContain('ok');
    });

    it("falls back to 'No content' when the value is empty", () => {
      const result = renderWithProviders(
        <Html
          label="Body"
          value=""
        />,
      );
      expect(result.container.textContent).toContain('No content');
    });

    it("falls back to 'No content' when sanitizing removed everything", () => {
      const result = renderWithProviders(
        <Html
          label="Body"
          value="<script>evil()</script>"
        />,
      );
      expect(result.container.textContent).toContain('No content');
    });

    it('shows the label, helperText and error from FieldLayout', () => {
      const result = renderWithProviders(
        <Html
          label="Description"
          value="<p>x</p>"
          helperText="server rendered"
          error="broken"
        />,
      );
      expect(result.container.textContent).toContain('Description');
      expect(result.container.textContent).toContain('broken');
    });

    it('skeleton branch paints neither the value nor the empty text', () => {
      const result = renderWithProviders(
        <Html
          label="Body"
          skeleton
          value='<p id="painted">x</p>'
        />,
      );
      expect(result.container.querySelector('#painted')).toBeNull();
      expect(result.container.textContent).not.toContain('No content');
    });
  });

  describe('registry resolution (HTML fieldtype)', () => {
    it("resolves 'HTML' to Html and forwards the value", () => {
      const Component = getFieldComponent('HTML')!;
      expect(Component).toBeTruthy();
      const element = (Component as RenderAdapter)(propsFor({ value: '<p>doc</p>', label: 'Body' }));
      expect(element.type).toBe(Html);
      expect(element.props.value).toBe('<p>doc</p>');
      expect(element.props.label).toBe('Body');
    });

    it('is display-only: the adapter passes no onChange', () => {
      const Component = getFieldComponent('HTML')!;
      const element = (Component as RenderAdapter)(propsFor());
      expect(element.props.onChange).toBeUndefined();
    });

    it("substitutes an empty string for a null value so 'No content' shows", () => {
      const Component = getFieldComponent('HTML')!;
      const element = (Component as RenderAdapter)(propsFor({ value: null as unknown as string }));
      expect(element.props.value).toBe('');
    });

    it('passes helperText / readOnly / skeleton / compact through', () => {
      const Component = getFieldComponent('HTML')!;
      const element = (Component as RenderAdapter)(
        propsFor({
          helperText: 'rendered server-side',
          readOnly: true,
          skeleton: true,
          compact: true,
        }),
      );
      expect(element.props.helperText).toBe('rendered server-side');
      expect(element.props.readOnly).toBe(true);
      expect(element.props.skeleton).toBe(true);
      expect(element.props.compact).toBe(true);
    });
  });
});
