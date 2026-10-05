import { afterEach, describe, expect, it } from 'vitest';

import { runConstraintAudit } from './constraintAudit';

const audit = new Function('scope', `return (${runConstraintAudit.toString()})(scope)`) as (
  scope?: string,
) => ReturnType<typeof runConstraintAudit>;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('constraint audit scope and painted visibility', () => {
  it('audits the requested surface while keeping the document-wide default', () => {
    document.body.innerHTML = `<div id="outside" style="border-radius:14px"></div><main id="story"><button id="inside" style="border-radius:15px">Inside</button></main>`;
    expect(audit('#story').violations.map((entry) => entry.id)).toEqual(['inside']);
    expect(audit().violations.map((entry) => entry.id)).toEqual(['outside', 'inside']);
  });

  it('rejects a missing requested surface instead of returning a clean report', () => {
    expect(() => audit('#missing')).toThrow(/scope/i);
  });

  it.each(['display:none', 'visibility:hidden', 'opacity:0'])(
    'ignores unpainted descendants under %s and reports them when shown',
    (style) => {
      document.body.innerHTML = `<main id="story"><div id="hidden" style="${style}"><button id="bad" style="border-radius:15px">Hidden error chrome</button></div></main>`;
      expect(audit('#story').violations).toEqual([]);
      document.querySelector('#hidden')!.removeAttribute('style');
      expect(audit('#story').violations.map((entry) => entry.id)).toEqual(['bad']);
    },
  );

  it('keeps painted children that explicitly override inherited visibility', () => {
    document.body.innerHTML = `<main id="story" style="visibility:hidden"><button id="shown" style="visibility:visible;border-radius:15px">Visible</button></main>`;
    expect(audit('#story').violations.map((entry) => entry.id)).toEqual(['shown']);
  });

  it('retains distinct stable paths for otherwise identical failing controls', () => {
    document.body.innerHTML = `<main id="story"><button style="border-radius:15px">Same</button><button style="border-radius:15px">Same</button></main>`;
    const first = audit('#story').violations;
    expect(first).toHaveLength(2);
    expect(first[0].key).toBeTruthy();
    expect(first[1].key).not.toBe(first[0].key);
    expect(audit('#story').violations.map((entry) => entry.key)).toEqual(first.map((entry) => entry.key));
  });
});
