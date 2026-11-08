import { describe, expect, it } from 'vitest';

import { ExternalIcon } from './ExternalIcon';
import { HR } from './Hr';
import { LI } from './Li';
import { MDX } from './Mdx';
import { MDXCodeBlock } from './MdxCodeBlock';
import { UL } from './Ul';

import {
  ExternalIcon as EntryExternalIcon,
  HR as EntryHR,
  LI as EntryLI,
  MDX as EntryMDX,
  MDXCodeBlock as EntryMDXCodeBlock,
  UL as EntryUL,
} from './index';

describe('package entry exports', () => {
  it.each([
    ['ExternalIcon', EntryExternalIcon, ExternalIcon],
    ['HR', EntryHR, HR],
    ['LI', EntryLI, LI],
    ['MDX', EntryMDX, MDX],
    ['MDXCodeBlock', EntryMDXCodeBlock, MDXCodeBlock],
    ['UL', EntryUL, UL],
  ])('re-exports %s from its module', (_name, fromEntry, fromModule) => {
    expect(fromEntry).toBe(fromModule);
  });
});
