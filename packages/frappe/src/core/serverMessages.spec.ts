import { describe, expect, it } from 'vitest';

import { readServerMessages, serverMessageLines } from './serverMessages';

describe(serverMessageLines, () => {
  it('ends a line at a block edge or <br> and drops inline tags', () => {
    expect(
      serverMessageLines(
        '<details><summary>Not permitted. Login to access</summary>Function <strong>x.y</strong> is not whitelisted.</details>',
      ),
    ).toEqual(['Not permitted. Login to access', 'Function x.y is not whitelisted.']);
    expect(serverMessageLines('One<br/>Two<p>Three</p><div>Four</div>Five')).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
    ]);
  });

  it('decodes entities once, after the tags are gone', () => {
    expect(serverMessageLines('A &amp; B &lt;b&gt; &amp;lt;')).toEqual(['A & B <b> &lt;']);
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
    expect(readServerMessages(raw)).toEqual(['First', 'Plain second']);
  });

  it('answers nothing for a payload that is not a JSON array', () => {
    expect(readServerMessages()).toEqual([]);
    expect(readServerMessages('Server error messages')).toEqual([]);
    expect(readServerMessages('{"message":"x"}')).toEqual([]);
  });
});
