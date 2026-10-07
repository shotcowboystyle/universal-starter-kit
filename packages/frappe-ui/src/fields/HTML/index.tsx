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

function isDangerousUri(value: string): boolean {
  const trimmed = value.trim().replaceAll(/[\u0000-\u001F\u007F]/g, '');
  return /^(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(trimmed);
}

/**
 * Sanitize HTML for safe display: drop executable tags, event-handler
 * attributes, and javascript:/vbscript: URLs. Prefer DOMParser when available;
 * fall back to regex stripping in non-DOM environments.
 */
export function sanitizeHtml(html: string): string {
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
            const el = child as Element;
            const tag = el.tagName.toLowerCase();
            if (FORBIDDEN_TAGS.has(tag)) {
              el.remove();
              continue;
            }
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
            child.parentNode?.removeChild(child);
          }
        }
      };

      walk(root);
      return root.innerHTML;
    } catch {
      // fall through to regex path
    }
  }

  return html
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/<\/?(?:script|style|iframe|object|embed|link|meta|base|form|svg|math|template)\b[^>]*>/gi, '')
    .replaceAll(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replaceAll(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replaceAll(
      /\s+(href|src|xlink:href|formaction|action|poster|cite)\s*=\s*(['"])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^'"]*\2/gi,
      '',
    );
}

function HtmlContent({ html }: { html: string }) {
  // Sanitized HTML only — inherit body metrics/color from the card (no 14px).
  const webProps = {
    dangerouslySetInnerHTML: { __html: html },
  };
  return <View {...(webProps as Record<string, unknown>)} />;
}

export function Html({
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
}: HtmlProps) {
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
}
