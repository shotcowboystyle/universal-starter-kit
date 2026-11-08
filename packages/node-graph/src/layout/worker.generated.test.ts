/**
 * Task 4.2. The committed worker string is current, classic, clean, and RUNS.
 *
 * A checksum on its own only proves the file was not hand-edited. What the
 * WebView actually needs is stronger: the string has to parse as a CLASSIC
 * script (an `export` in it is a SyntaxError in a non-module worker), it has
 * to carry no `import.meta` (design §9.4 layer 1 — a parse-time SyntaxError,
 * so no guard and no try/catch ever runs), and it has to answer the protocol.
 * So the last case here evaluates the artefact in a synthetic worker scope and
 * drives a real layout through it.
 *
 * The bundler is re-run in a SUBPROCESS rather than imported. faces.test.ts
 * set that precedent for the same reason: a generator is Node tooling with a
 * native dependency, and pulling esbuild into the vitest module graph to
 * compute one hash is a much larger surface than spawning it.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { layoutWorkerBytes, layoutWorkerSha256, layoutWorkerSource } from "./worker.generated";
import type { LayoutRequest, LayoutWorkerResponse } from "./types";

const packageRoot = path.resolve(__dirname, "../..");

const generator = (...args: string[]): string => 
  execFileSync(process.execPath, ["scripts/build-layout-worker.mjs", ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
;

describe("worker.generated", () => {
  it("matches a fresh bundle: the committed sha256 is what the bundler emits today", () => {
    expect(generator("--sha")).toBe(layoutWorkerSha256);
  });

  it("is byte-for-byte current, header and all", () => {
    // `--check` compares the WHOLE emitted module, so a hand-edited comment or
    // a stale byte count fails here even when the payload happens to match.
    expect(() => generator("--check")).not.toThrow();
  });

  it("reports its own size honestly", () => {
    expect(layoutWorkerBytes).toBe(Buffer.byteLength(layoutWorkerSource, "utf8"));
  });

  it("carries no `import.meta` token", () => {
    expect(layoutWorkerSource).not.toContain("import.meta");
  });

  it("carries no `elkjs`, because decision D2 is unruled", () => {
    // Not a style point. elkjs is `EPL-2.0 OR GPL-3.0-or-later` against this
    // repo's Apache-2.0 and Clay has not ruled, and design §8 puts the 445 KB
    // gz it would add behind exactly this assertion.
    expect(layoutWorkerSource.toLowerCase()).not.toContain("elkjs");
    expect(layoutWorkerSource.toLowerCase()).not.toContain("elk.bundled");
  });

  it("is a CLASSIC script: no top-level import or export survives", () => {
    expect(layoutWorkerSource).not.toMatch(/(^|\n)\s*export\s/u);
    expect(layoutWorkerSource).not.toMatch(/(^|\n)\s*import\s/u);
    expect(layoutWorkerSource.startsWith('"use strict";(()=>{')).toBe(true);
  });

  it("bundles dagre in, so the worker needs nothing at runtime", () => {
    expect(layoutWorkerSource).toContain("WorkerGlobalScope");
    // dagre's own vocabulary. If the engine were external the bundle would be
    // a few hundred bytes of wiring and this would miss.
    expect(layoutWorkerSource).toContain("rankdir");
    expect(layoutWorkerBytes).toBeGreaterThan(20_000);
  });

  it("evaluates outside a worker without throwing", () => {
    // No WorkerGlobalScope or self: the scope probe must use `typeof`, since
    // reading an undeclared global throws a ReferenceError.
    const sandbox: Record<string, unknown> = {};
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    expect(() => vm.runInContext(layoutWorkerSource, sandbox)).not.toThrow();
  });

  describe("evaluated in a synthetic worker scope", () => {
    /** Runs the artefact the way a blob Worker would, and returns its outbox. */
    const boot = () => {
      class FakeWorkerGlobalScope {}
      const posted: LayoutWorkerResponse[] = [];
      const listeners: ((event: { data: unknown }) => void)[] = [];
      const scope = new FakeWorkerGlobalScope() as FakeWorkerGlobalScope & {
        addEventListener: (type: string, listener: (event: { data: unknown }) => void) => void;
        postMessage: (message: LayoutWorkerResponse) => void;
      };
      scope.addEventListener = (type, listener) => {
        if (type === "message") listeners.push(listener);
      };
      scope.postMessage = (message) => {
        posted.push(message);
      };
      const sandbox: Record<string, unknown> = {
        WorkerGlobalScope: FakeWorkerGlobalScope,
        self: scope,
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(layoutWorkerSource, sandbox);
      return {
        posted,
        send: (data: unknown) => {
          for (const listener of listeners) listener({ data });
        },
        listeners,
      };
    };

    it("installs exactly one message listener", () => {
      expect(boot().listeners).toHaveLength(1);
    });

    it("answers `ping` with `pong`", () => {
      const worker = boot();
      worker.send({ t: "ping" });
      expect(worker.posted).toHaveLength(1);
      expect(worker.posted[0].t).toBe("pong");
    });

    it("lays a graph out and posts positions back", () => {
      const worker = boot();
      const request: LayoutRequest = {
        nodes: [
          { id: "a", width: 190, height: 72, position: { x: 0, y: 0 } },
          { id: "b", width: 190, height: 72, position: { x: 0, y: 0 } },
        ],
        edges: [{ id: "a->b", source: "a", target: "b" }],
      };
      worker.send({ t: "layout", id: 7, request });
      expect(worker.posted).toHaveLength(1);
      const response = worker.posted[0];
      expect(response.t).toBe("result");
      if (response.t !== "result") return;
      expect(response.id).toBe(7);
      expect(response.result.engine).toBe("dagre");
      expect(Object.keys(response.result.positions).sort()).toStrictEqual(["a", "b"]);
      expect(response.result.positions.b.y).toBeGreaterThan(response.result.positions.a.y);
    });

    it("reports a malformed request as an `error` message rather than throwing", () => {
      // A throw inside a Worker arrives as an `error` event with no line
      // number in a WebView, which is the least useful diagnostic there is.
      const worker = boot();
      worker.send({ t: "layout", id: 1, request: { nodes: null, edges: [] } });
      expect(worker.posted).toHaveLength(1);
      expect(worker.posted[0].t).toBe("error");
    });

    it("stays silent on a message it does not own", () => {
      const worker = boot();
      worker.send({ t: "something-else" });
      worker.send(null);
      worker.send("hello");
      expect(worker.posted).toHaveLength(0);
    });
  });
});
