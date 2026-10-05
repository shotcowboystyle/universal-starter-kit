'use strict';

/**
 * Vitest workers `require()` CJS deps (use-sync-external-store) without
 * going through Vite aliases. The factory in vitest.ts sets MPO_VITEST_*
 * to the same physical copies the aliases bind; this setup file (prepended
 * onto every createVitestConfig setupFiles list) makes those requires land
 * there.
 */
const Module = require('module');
const path = require('path');

const reactDir = process.env.MPO_VITEST_REACT;
const reactDomDir = process.env.MPO_VITEST_REACT_DOM;
const schedulerDir = process.env.MPO_VITEST_SCHEDULER;

if (reactDir && reactDomDir && !Module._mpoOneReact) {
  Module._mpoOneReact = true;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function pinned(request, parent, isMain, options) {
    const next =
      request === 'react'
        ? reactDir
        : request.startsWith('react/')
          ? path.join(reactDir, request.slice('react/'.length))
          : request === 'react-dom'
            ? reactDomDir
            : request.startsWith('react-dom/')
              ? path.join(reactDomDir, request.slice('react-dom/'.length))
              : request === 'scheduler' && schedulerDir
                ? schedulerDir
                : null;
    if (next) {
      try {
        return orig.call(this, next, parent, isMain, options);
      } catch {
        // package layout didn't match — keep Node's original lookup
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
}
