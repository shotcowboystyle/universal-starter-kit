/**
 * Dedicated `@repo/markdown/mermaid` entry (LC-16 canonical
 * mermaid renderer) for lazy consumers like the rich-text editor.
 *
 * Deliberately free of static dependencies: importing the package BARREL
 * from another package makes the barrel's whole static closure (shiki,
 * the MDX compiler, remark…) graph-reachable, and app chunk-group tests
 * pin reachable node_modules eager. This entry keeps the editor's dynamic
 * import surgical — the only heavy module behind it is `mermaid` itself,
 * loaded through renderMermaidDiagram's own dynamic import.
 *
 * The read-only `MermaidBlock` component intentionally does NOT export
 * from here (it pulls react/tamagui); the package barrel exports it from
 * `./MermaidBlock` directly.
 */

export { mountDiagramSvg } from './mountDiagramSvg';
export {
  renderMermaidDiagram,
  resetMermaidForTesting,
  type MermaidRenderOptions,
  type MermaidRenderResult,
} from './renderMermaidDiagram';
