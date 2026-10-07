import { Text } from '@repo/ui';
import { wrapBareTextChildren } from '@repo/table-primitives';
import { flexRender } from '@tanstack/react-table';
import type { ComponentType, ReactNode } from 'react';
import type { FontSizeTokens } from 'tamagui';

type Renderer = (ctx: unknown) => ReactNode;
interface RendererCellProps {
  ctx: unknown;
  fontSize: FontSizeTokens;
}

function isPlainRenderer(cellDef: unknown): cellDef is Renderer {
  return (
    typeof cellDef === 'function' &&
    !(cellDef as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent
  );
}

function CellValue({ value, fontSize }: { value: ReactNode; fontSize: FontSizeTokens }) {
  return (
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
}

const rendererCells = new WeakMap<Renderer, ComponentType<RendererCellProps>>();

/**
 * One component per renderer, so the renderer's hooks belong to a component
 * whose identity follows the renderer's, as they did inside flexRender's
 * element: a new renderer remounts rather than reusing another's hook slots.
 */
function rendererCell(render: Renderer): ComponentType<RendererCellProps> {
  let Cell = rendererCells.get(render);
  if (!Cell) {
    Cell = ({ ctx, fontSize }: RendererCellProps) => (
      <CellValue
        value={render(ctx)}
        fontSize={fontSize}
      />
    );
    rendererCells.set(render, Cell);
  }
  return Cell;
}

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
export function CellContent({ cellDef, ctx, fontSize }: { cellDef: unknown; ctx: unknown; fontSize: FontSizeTokens }) {
  if (!isPlainRenderer(cellDef)) {
    return (
      <CellValue
        value={flexRender(cellDef as never, ctx as never)}
        fontSize={fontSize}
      />
    );
  }
  const Cell = rendererCell(cellDef);
  return (
    <Cell
      ctx={ctx}
      fontSize={fontSize}
    />
  );
}
