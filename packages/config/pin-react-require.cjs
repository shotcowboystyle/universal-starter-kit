'use strict';

/**
 * Vitest workers `require()` CJS deps (use-sync-external-store) without
 * going through Vite aliases. The factory in vitest.ts sets MPO_VITEST_*
 * to the same physical copies the aliases bind; this setup file (prepended
 * onto every createVitestConfig setupFiles list) makes those requires land
 * there.
 */

/**
 * Node's private resolver hook, which `@types/node` does not declare.
 * @typedef {(request: string, parent: unknown, isMain: boolean, options?: unknown) => string} ResolveFilename
 * @typedef {{ _resolveFilename: ResolveFilename, _mpoOneReact?: boolean }} ModuleInternals
 */

/** @type {ModuleInternals} */
const Module = require('node:module');
const path = require('node:path');

const reactDir = process.env.MPO_VITEST_REACT;
const reactDomDir = process.env.MPO_VITEST_REACT_DOM;
const schedulerDir = process.env.MPO_VITEST_SCHEDULER;

/**
 * @param {string | undefined} value an environment value
 * @returns {value is string} true when the variable is set and non-empty
 */
const isSet = (value) => value !== undefined && value !== '';

/**
 * Where a request should be pinned to, if anywhere.
 * @param {string} request the module specifier being resolved
 * @param {string} react physical react directory
 * @param {string} reactDom physical react-dom directory
 * @returns {string | null} the pinned location, or null to leave the request alone
 */
const pinnedTarget = (request, react, reactDom) => {
  if (request === 'react') {
    return react;
  }
  if (request.startsWith('react/')) {
    return path.join(react, request.slice('react/'.length));
  }
  if (request === 'react-dom') {
    return reactDom;
  }
  if (request.startsWith('react-dom/')) {
    return path.join(reactDom, request.slice('react-dom/'.length));
  }
  return request === 'scheduler' && isSet(schedulerDir) ? schedulerDir : null;
};

if (isSet(reactDir) && isSet(reactDomDir) && !Module._mpoOneReact) {
  Module._mpoOneReact = true;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function _resolveFilename(request, parent, isMain, options) {
    const next = pinnedTarget(request, reactDir, reactDomDir);
    if (next !== null) {
      try {
        return orig.call(this, next, parent, isMain, options);
      } catch {
        // package layout didn't match — keep Node's original lookup
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
}
