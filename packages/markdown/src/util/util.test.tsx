import type { Element, Root } from 'hast';
import { describe, expect, it } from 'vitest';

import { rehypeMetaAttributes } from './rehype-meta-attributes';

const createCodeNode = (meta?: string): Element => ({
  type: 'element',
  tagName: 'code',
  properties: {
    className: ['language-tsx'],
  },
  data: meta === undefined ? undefined : { meta },
  children: [
    {
      type: 'text',
      value: 'const x: number = 42;\nconsole.log(x);',
    },
  ],
});

const transform = (code: Element): Element => {
  const tree: Root = {
    type: 'root',
    children: [{ type: 'element', tagName: 'pre', properties: {}, children: [code] }],
  };
  rehypeMetaAttributes()(tree);
  return code;
};

describe(rehypeMetaAttributes, () => {
  it('should extract and apply meta attributes as properties', () => {
    const { properties } = transform(createCodeNode('title="Example Code" highlight="1-2" showLineNumbers'));

    expect(properties).toHaveProperty('title', 'Example Code');
    expect(properties).toHaveProperty('highlight', '1-2');
    expect(properties).toHaveProperty('showLineNumbers', '');
  });

  it('should handle multiple attributes correctly', () => {
    const { properties } = transform(createCodeNode("title='Single' lang=tsx showLineNumbers"));

    expect(properties).toStrictEqual({
      className: ['language-tsx'],
      lang: 'tsx',
      showLineNumbers: '',
      title: 'Single',
    });
  });

  it('should not modify nodes without meta attributes', () => {
    const { properties } = transform(createCodeNode());

    expect(properties).toStrictEqual({ className: ['language-tsx'] });
  });

  it('should handle empty meta attributes without breaking', () => {
    const { properties } = transform(createCodeNode(''));

    expect(properties).toStrictEqual({ className: ['language-tsx'] });
  });
});
