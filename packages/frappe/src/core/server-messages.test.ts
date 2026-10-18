import { describe, expect, it } from 'vitest';

import { readServerMessages, serverMessageLines } from './server-messages';

describe(serverMessageLines, () => {
  it('ends a line at a block edge or <br> and drops inline tags', () => {
    expect(
      serverMessageLines(
        '<details><summary>Not permitted. Login to access</summary>Function <strong>x.y</strong> is not whitelisted.</details>',
      ),
    ).toStrictEqual(['Not permitted. Login to access', 'Function x.y is not whitelisted.']);
    expect(serverMessageLines('One<br/>Two<p>Three</p><div>Four</div>Five')).toStrictEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
    ]);
  });

  it('decodes entities once, after the tags are gone', () => {
    expect(serverMessageLines('A &amp; B &lt;b&gt; &amp;lt;')).toStrictEqual(['A & B <b> &lt;']);
  });
});

describe(readServerMessages, () => {
  it('reads every entry in order and skips what carries no text', () => {
    const raw = JSON.stringify([
      JSON.stringify({ message: 'First' }),
      JSON.stringify({ message: '' }),
      'Plain second',
      JSON.stringify({ title: 'no message' }),
    ]);
    expect(readServerMessages(raw)).toStrictEqual(['First', 'Plain second']);
  });

  it('answers nothing for a payload that is not a JSON array', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(readServerMessages(undefined)).toStrictEqual([]);
    expect(readServerMessages('Server error messages')).toStrictEqual([]);
    expect(readServerMessages('{"message":"x"}')).toStrictEqual([]);
  });
});
