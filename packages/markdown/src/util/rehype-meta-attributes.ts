// https://github.com/wooorm/xdm#syntax-highlighting-with-the-meta-field

import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

const META_ATTRIBUTE_REGEX = /\b(?<name>[-\w]+)(?:=(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^"'\s]+)))?/gu;

const onElement = (node: Element) => {
  const meta = node.data?.meta;
  if (node.tagName !== 'code' || meta === undefined || meta === null || meta === '') {
    return;
  }
  for (const { groups } of meta.matchAll(META_ATTRIBUTE_REGEX)) {
    if (groups) {
      node.properties[groups.name] = groups.double ?? groups.single ?? groups.bare ?? '';
    }
  }
};

export const rehypeMetaAttributes =
  (_options = {}) =>
  (tree: Root) => {
    visit(tree, 'element', onElement);
  };
