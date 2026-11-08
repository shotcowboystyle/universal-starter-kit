import type { CompileOptions } from '@mdx-js/mdx';
import { useEffect, useState } from 'react';

const logger = console;

const FRONTMATTER_REGEX = /^---\r?\n(?<body>[\s\S]*?)\r?\n---\r?\n?/u;
const LINE_BREAK_REGEX = /\r?\n/u;
const QUOTED_VALUE_REGEX = /^(?<quote>["']).*\k<quote>$/u;

export type FrontmatterValue = string | number | boolean | null;

export interface ParsedFrontmatter {
  content: string;
  data: Record<string, FrontmatterValue>;
}

export interface CompileMdxResult {
  code?: string;
  frontmatter?: ParsedFrontmatter;
}

const parseFrontmatterValue = (raw: string): FrontmatterValue => {
  if (QUOTED_VALUE_REGEX.test(raw)) {
    return raw.slice(1, -1);
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null') {
    return null;
  }
  if (raw !== '' && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return raw;
};

/**
 * Minimal browser-safe frontmatter parser (gray-matter depends on Buffer,
 * which does not exist in the browser). Handles simple `key: value` YAML.
 */
export const parseFrontmatter = (source: string): ParsedFrontmatter => {
  const match = FRONTMATTER_REGEX.exec(source);
  if (!match?.groups) {
    return { content: source, data: {} };
  }
  const data: ParsedFrontmatter['data'] = {};
  for (const line of match.groups.body.split(LINE_BREAK_REGEX)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    data[key] = parseFrontmatterValue(line.slice(separatorIndex + 1).trim());
  }
  return { content: source.slice(match[0].length), data };
};

const compileMdx = async (source: string, options?: CompileOptions): Promise<string> => {
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
    import('../util/rehype-meta-attributes'),
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
  return value.toString();
};

export const useCompileMdx = (source: string, options?: CompileOptions): CompileMdxResult => {
  const [code, setCode] = useState<string | undefined>();
  const [frontmatter, setFrontmatter] = useState<ParsedFrontmatter | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const compiled = await compileMdx(source, options);
        if (cancelled) {
          return;
        }
        setCode(compiled);
        setFrontmatter(parseFrontmatter(source));
      } catch (error) {
        if (cancelled) {
          return;
        }
        logger.error('useCompileMdx: failed to compile MDX source', error);
        setCode(undefined);
        setFrontmatter(undefined);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [source, options]);

  if (code === undefined || code === '' || !frontmatter) {
    return {};
  }
  return { code, frontmatter };
};
