import { useEffect, useState } from 'react';

const logger = console;

const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Minimal browser-safe frontmatter parser (gray-matter depends on Buffer,
 * which does not exist in the browser). Handles simple `key: value` YAML.
 */
export function parseFrontmatter(source: string): {
  content: string;
  data: Record<string, any>;
} {
  const match = frontmatterRegex.exec(source);
  if (!match) {
    return { content: source, data: {} };
  }
  const data: Record<string, any> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value: any = line.slice(separatorIndex + 1).trim();
    if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value === 'null') {
      value = null;
    } else if (value !== '' && !Number.isNaN(Number(value))) {
      value = Number(value);
    }
    data[key] = value;
  }
  return { content: source.slice(match[0].length), data };
}

export function useCompileMdx(
  source: string,
  options?: Record<string, any>,
): {
  code?: string;
  frontmatter?: Record<string, any>;
} {
  const [code, setCode] = useState<string | undefined>();
  const [frontmatter, setFrontmatter] = useState<Record<string, any> | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          { compile },
          { default: rehypeAutolinkHeadings },
          { default: rehypeSlug },
          { default: remarkFrontmatter },
          { default: remarkMdxFrontmatter },
          { rehypeMetaAttributes },
        ] = await Promise.all([
          import('@mdx-js/mdx'),
          import('rehype-autolink-headings'),
          import('rehype-slug'),
          import('remark-frontmatter'),
          import('remark-mdx-frontmatter'),
          import('../util/rehypeMetaAttributes'),
        ]);
        const { value } = await compile(source, {
          ...options,
          development: false,
          outputFormat: 'function-body',
          remarkPlugins: [
            ...(options?.remarkPlugins ?? []),
            [remarkMdxFrontmatter, { name: 'frontmatter' }],
            remarkFrontmatter,
          ],
          rehypePlugins: [...(options?.rehypePlugins ?? []), rehypeAutolinkHeadings, rehypeMetaAttributes, rehypeSlug],
        });
        if (cancelled) {
          return;
        }
        setCode(value.toString());
        setFrontmatter(parseFrontmatter(source));
      } catch (error) {
        if (cancelled) {
          return;
        }
        logger.error('useCompileMdx: failed to compile MDX source', error);
        setCode(undefined);
        setFrontmatter(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, options]);

  if (!code || !frontmatter) {
    return {};
  }
  return { code, frontmatter };
}
