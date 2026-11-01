/**
 * Frappe HTML field — sanitised read-only HTML in FieldLayout + cardSurface.
 * Design-law: compose FieldLayout; inherit body metrics (no 14px / 1px fork).
 */
import { FieldLayout, Skeleton, formCommonColors } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import { Text, View, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

export interface HtmlProps extends Omit<YStackProps, 'children'> {
  label?: string;
  /** HTML string to render */
  value?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
}

const FORBIDDEN_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
]);

const URI_ATTRS = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'poster', 'cite']);

const isDangerousUri = (value: string): boolean => {
  // oxlint-disable-next-line eslint/no-control-regex -- strips control characters browsers ignore inside a URI scheme (java\tscript:)
  const trimmed = value.trim().replaceAll(/[\u0000-\u001F\u007F]/gu, '');
  return /^(?:javascript|vbscript|data\s*:\s*text\/html)/iu.test(trimmed);
};

/**
 * Sanitize HTML for safe display: drop executable tags, event-handler
 * attributes, and javascript:/vbscript: URLs. Prefer DOMParser when available;
 * fall back to regex stripping in non-DOM environments.
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) {
    return '';
  }

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(`<div id="__root__">${html}</div>`, 'text/html');
      const root = doc.querySelector('#__root__');
      if (!root) {
        return '';
      }

      const walk = (node: Node) => {
        const children = [...node.childNodes];
        for (const child of children) {
          if (child.nodeType === 1) {
            // SAFETY: nodeType 1 is ELEMENT_NODE, so this child is an Element
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            const el = child as Element;
            const tag = el.tagName.toLowerCase();
            if (FORBIDDEN_TAGS.has(tag)) {
              el.remove();
              continue;
            }
            // oxlint-disable-next-line unicorn/no-useless-spread -- el.attributes is live; the copy keeps iteration stable while attributes are removed
            for (const attr of [...el.attributes]) {
              const name = attr.name.toLowerCase();
              if (name.startsWith('on') || name === 'srcdoc') {
                el.removeAttribute(attr.name);
                continue;
              }
              if (URI_ATTRS.has(name) && isDangerousUri(attr.value)) {
                el.removeAttribute(attr.name);
              }
            }
            walk(el);
          } else if (child.nodeType === 8) {
            child.remove();
          }
        }
      };

      walk(root);
      // oxlint-disable-next-line github/no-inner-html -- reads back the serialized, already-sanitized tree; nothing is assigned
      return root.innerHTML;
    } catch {
      // fall through to regex path
    }
  }

  return (
    html
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/<\/?(?:script|style|iframe|object|embed|link|meta|base|form|svg|math|template)\b[^>]*>/giu, '')
      // oxlint-disable-next-line sonarjs/super-linear-regex -- fallback for non-DOM runtimes only, over one field's HTML value
      .replaceAll(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '')
      // oxlint-disable-next-line sonarjs/super-linear-regex -- fallback for non-DOM runtimes only, over one field's HTML value
      .replaceAll(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '')
      .replaceAll(
        // oxlint-disable-next-line sonarjs/super-linear-regex -- fallback for non-DOM runtimes only, over one field's HTML value
        /\s+(?:href|src|xlink:href|formaction|action|poster|cite)\s*=\s*(?<quote>['"])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^'"]*\k<quote>/giu,
        '',
      )
  );
};

const HtmlContent = ({ html }: { html: string }) => {
  // Sanitized HTML only — inherit body metrics/color from the card (no 14px).
  const webProps = {
    dangerouslySetInnerHTML: { __html: html },
  };
  // SAFETY: tamagui's web View forwards dangerouslySetInnerHTML to the DOM node; its prop types just don't declare it
  // oxlint-disable-next-line anti-slop/no-known-value-widening, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
  return <View {...(webProps as Record<string, unknown>)} />;
};

export const Html = ({
  label,
  value = '',
  error,
  helperText,
  disabled = false,
  required = false,
  readOnly: _readOnly,
  skeleton = false,
  compact = false,
  ...stackProps
}: HtmlProps) => {
  const { knobProps } = useResolvedKnobs();
  const sanitizedHtml = useMemo(() => sanitizeHtml(value), [value]);

  if (skeleton) {
    return (
      <YStack {...stackProps}>
        <FieldLayout
          label={label}
          required={required}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={compact ? 40 : 60}
          />
        </FieldLayout>
      </YStack>
    );
  }

  return (
    <YStack {...stackProps}>
      <FieldLayout
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        disabled={disabled}>
        <YStack
          {...knobProps.cardSurface}
          {...knobProps.body}
          opacity={disabled ? 0.6 : 1}
          minHeight={compact ? 40 : 60}>
          {sanitizedHtml ? (
            <HtmlContent html={sanitizedHtml} />
          ) : (
            <Text
              color={formCommonColors.muted}
              {...knobProps.body}>
              No content
            </Text>
          )}
        </YStack>
      </FieldLayout>
    </YStack>
  );
};
