import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { rehypeMetaAttributes } from './rehypeMetaAttributes';

const mockAST = {
  type: 'root',
  children: [
    {
      type: 'element',
      tagName: 'pre',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {
            className: ['language-tsx'],
          },
          data: {
            meta: 'title="Example Code" highlight="1-2" showLineNumbers',
          },
          children: [
            {
              type: 'text',
              value: 'const x: number = 42;\nconsole.log(x);',
            },
          ],
        },
      ],
    },
  ],
};

describe(rehypeMetaAttributes, () => {
  it('should extract and apply meta attributes as properties', () => {
    const transformer = rehypeMetaAttributes();
    transformer(mockAST);
    let foundCodeNode = false;
    visit(mockAST, 'element', (node: any) => {
      if (node.tagName === 'code') {
        foundCodeNode = true;
        expect(node.properties).toHaveProperty('title', 'Example Code');
        expect(node.properties).toHaveProperty('highlight', '1-2');
        expect(node.properties).toHaveProperty('showLineNumbers', '');
      }
    });
    expect(foundCodeNode).toBe(true);
  });

  it('should handle multiple attributes correctly', () => {
    const transformer = rehypeMetaAttributes();
    transformer(mockAST);
    visit(mockAST, 'element', (node: any) => {
      if (node.tagName === 'code') {
        expect(Object.keys(node.properties)).toEqual(
          expect.arrayContaining(['className', 'title', 'highlight', 'showLineNumbers']),
        );
      }
    });
  });

  it('should not modify nodes without meta attributes', () => {
    const originalAST = JSON.parse(JSON.stringify(mockAST));
    originalAST.children[0].children[0].data = undefined;
    originalAST.children[0].children[0].properties = {
      className: ['language-tsx'],
    };
    const transformer = rehypeMetaAttributes();
    transformer(originalAST);
    visit(originalAST, 'element', (node) => {
      if (node.tagName === 'code') {
        expect(node.properties).toEqual({ className: ['language-tsx'] });
      }
    });
  });

  it('should handle empty meta attributes without breaking', () => {
    const emptyMetaAST = JSON.parse(JSON.stringify(mockAST));
    emptyMetaAST.children[0].children[0].data.meta = '';
    emptyMetaAST.children[0].children[0].properties = {
      className: ['language-tsx'],
    };
    const transformer = rehypeMetaAttributes();
    transformer(emptyMetaAST);
    visit(emptyMetaAST, 'element', (node) => {
      if (node.tagName === 'code') {
        expect(node.properties).toEqual({ className: ['language-tsx'] });
      }
    });
  });
});
