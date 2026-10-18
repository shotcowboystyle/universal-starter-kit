/**
 * Safe evaluator for Frappe `depends_on` / `mandatory_depends_on` /
 * `read_only_depends_on` expressions.
 *
 * The implementation lives in `@repo/frappe-ui/src/dependsOn`
 * so SchemaForm (which receives raw `depends_on` strings on the standalone
 * FrappeForm path) shares the exact same Hermes/GJS/CSP-safe parser instead
 * of a string-eval fork. This module re-exports it for the backoffice form
 * engine; the specs next door exercise the shared source. Grammar coverage
 * and fallback semantics are documented at the implementation.
 */

// Dedicated "./dependsOn" subpath (see frappe-ui package.json exports): keeps
// the node-environment specs next door from dragging the full frappe-ui barrel
// (FrappeTable → table dist → react-native) into a DOM-less run, while still
// resolving under Vite/Storybook (the old extension-less "./src/*" path did not).
export { compileDependsOn, evaluateDependsOn, type DependsDoc, type DependsEvaluator } from '@repo/frappe-ui/dependsOn';
