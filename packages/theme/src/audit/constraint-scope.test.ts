import { afterEach, describe, expect, it } from 'vitest';

import { runConstraintAudit } from './constraint-audit';

// oxlint-disable-next-line typescript/no-implied-eval, eslint/no-new-func, sonarjs/code-eval -- rebuilding the function from its source proves it is self-contained
const audit = new Function('scope', `return (${runConstraintAudit.toString()})(scope)`) as (
  scope?: string,
) => ReturnType<typeof runConstraintAudit>;

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every test in this file
afterEach(() => {
  document.body.replaceChildren();
});

const render = (html: string) => {
  document.body.replaceChildren();
  document.body.insertAdjacentHTML('beforeend', html);
};

describe('constraint audit scope and painted visibility', () => {
  it('audits the requested surface while keeping the document-wide default', () => {
    render(
      `<div id="outside" style="border-radius:14px"></div><main id="story"><button id="inside" style="border-radius:15px">Inside</button></main>`,
    );
    expect(audit('#story').violations.map((entry) => entry.id)).toStrictEqual(['inside']);
    expect(audit().violations.map((entry) => entry.id)).toStrictEqual(['outside', 'inside']);
  });

  it('rejects a missing requested surface instead of returning a clean report', () => {
    expect(() => audit('#missing')).toThrow(/scope/iu);
  });

  it.each(['display:none', 'visibility:hidden', 'opacity:0'])(
    'ignores unpainted descendants under %s and reports them when shown',
    (style) => {
      render(
        `<main id="story"><div id="hidden" style="${style}"><button id="bad" style="border-radius:15px">Hidden error chrome</button></div></main>`,
      );
      expect(audit('#story').violations).toStrictEqual([]);
      document.querySelector('#hidden')!.removeAttribute('style');
      expect(audit('#story').violations.map((entry) => entry.id)).toStrictEqual(['bad']);
    },
  );

  it('keeps painted children that explicitly override inherited visibility', () => {
    render(
      `<main id="story" style="visibility:hidden"><button id="shown" style="visibility:visible;border-radius:15px">Visible</button></main>`,
    );
    expect(audit('#story').violations.map((entry) => entry.id)).toStrictEqual(['shown']);
  });

  it('retains distinct stable paths for otherwise identical failing controls', () => {
    render(
      `<main id="story"><button style="border-radius:15px">Same</button><button style="border-radius:15px">Same</button></main>`,
    );
    const first = audit('#story').violations;
    expect(first).toHaveLength(2);
    expect(first[0].key).toBeTruthy();
    expect(first[1].key).not.toBe(first[0].key);
    expect(audit('#story').violations.map((entry) => entry.key)).toStrictEqual(first.map((entry) => entry.key));
  });
});
