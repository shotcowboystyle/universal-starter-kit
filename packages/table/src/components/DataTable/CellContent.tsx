import { wrapBareTextChildren } from '@repo/table-primitives';
import { Text } from '@repo/ui';
import { flexRender } from '@tanstack/react-table';
import type { ComponentType, ReactNode } from 'react';
import type { FontSizeTokens } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- ctx is a TanStack CellContext of an erased row type; the renderer owns its shape
type Renderer = (ctx: unknown) => ReactNode;
interface RendererCellProps {
  ctx: unknown;
  fontSize: FontSizeTokens;
}

const isPlainRenderer = (cellDef: unknown): cellDef is Renderer =>
  typeof cellDef === 'function' &&
  // SAFETY: cellDef is a function; class components carry `prototype.isReactComponent`, read optionally
  // oxlint-disable-next-line typescript/strict-boolean-expressions -- React marks class components with a truthy object, not `true`
  !(cellDef as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent;

const CellValue = ({ value, fontSize }: { value: ReactNode; fontSize: FontSizeTokens }) => (
  <>
    {wrapBareTextChildren(value ?? null, (label, key) => (
      <Text
        key={key}
        fontSize={fontSize}>
        {label}
      </Text>
    ))}
  </>
);

const rendererCells = new WeakMap<Renderer, ComponentType<RendererCellProps>>();

/**
 * One component per renderer, so the renderer's hooks belong to a component
 * whose identity follows the renderer's, as they did inside flexRender's
 * element: a new renderer remounts rather than reusing another's hook slots.
 */
const rendererCell = (render: Renderer): ComponentType<RendererCellProps> => {
  let Cell = rendererCells.get(render);
  if (!Cell) {
    const RendererCell = ({ ctx, fontSize }: RendererCellProps) => (
      <CellValue
        value={render(ctx)}
        fontSize={fontSize}
      />
    );
    Cell = RendererCell;
    rendererCells.set(render, Cell);
  }
  return Cell;
};

/**
 * A custom cell's output with every bare string or number riding house Text
 * (LC-82 TEXT-RIDES-TEXT, AN-8), on web and native alike (MPO-446).
 *
 * tanstack's default cell and the common `cell: (info) => info.getValue()`
 * return primitives, and flexRender turns a function renderer into an
 * element, which hides the primitive from the caller. On web the value then
 * lands as a text node in the cell's View and takes neither the fontWeight
 * nor the bodyFont knob; on native RN drops it outright. So a plain function
 * renderer is called here and what it returns is wrapped. Class and exotic
 * components still go through flexRender.
 */
export const CellContent = ({
  cellDef,
  ctx,
  fontSize,
}: {
  cellDef: unknown;
  ctx: unknown;
  fontSize: FontSizeTokens;
}) => {
  if (!isPlainRenderer(cellDef)) {
    return (
      <CellValue
        // SAFETY: cellDef/ctx are a column's own cell renderer and its CellContext, erased to unknown by the caller
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
        value={flexRender(cellDef as never, ctx as never)}
        fontSize={fontSize}
      />
    );
  }
  const Cell = rendererCell(cellDef);
  return (
    // oxlint-disable-next-line react/static-components -- rendererCell caches one component per renderer, so identity is stable across renders
    <Cell
      ctx={ctx}
      fontSize={fontSize}
    />
  );
};
