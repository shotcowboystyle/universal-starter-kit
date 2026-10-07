import { renderWithProviders } from "@repo/test-utils";
import { Preset } from "@repo/theme";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataTableColumn } from "../../types";
import { DataTable } from "./index";

// Happy DOM has no viewport measurements. Keep the actual virtualizer and row renderer.
vi.mock(import('@tanstack/react-virtual'), async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...options,
        initialRect: { width: 800, height: 240 },
        observeElementRect: (_instance, callback) => {
          callback({ width: 800, height: 240 });
          return () => {};
        },
        observeElementOffset: (_instance, callback) => {
          callback(0, false);
          return () => {};
        },
        scrollToFn: () => {},
      }),
  };
});

const data = [{ id: "1", account: "Account 1", balance: "10.00" }];
const columns: DataTableColumn<(typeof data)[number]>[] = [
  { accessorKey: "account", header: "Account", size: 320, footer: "Totals" },
  { accessorKey: "balance", header: "Balance", size: 80, footer: "10.00" },
];
const allAuxiliaries = {
  enableRowSelection: true,
  showRowNumbers: true,
  enableRowExpansion: true,
  showDeleteRow: true,
};

function renderTable(props = {}, size: "small" | "medium" | "large" = "medium") {
  return renderWithProviders(
    <Preset overrides={{ size }}>
      <DataTable
        data={data}
        columns={columns}
        layout="table"
        columnLayout="scroll"
        enablePagination={false}
        {...props}
      />
    </Preset>,
  );
}

function cells(row: Element): HTMLElement[] {
  return [...row.children].filter((element) =>
    ["cell", "columnheader"].includes(element.getAttribute("role") ?? ""),
  ) as HTMLElement[];
}

function width(cell: HTMLElement): number {
  return Number.parseFloat(
    cell.style.width || /(?:^| )_w-([\d.]+)px(?: |$)/.exec(cell.className)?.[1] ?? "NaN",
  );
}

function rows(container: HTMLElement) {
  const header = container.querySelector('thead [role="row"]')!;
  const body = container.querySelector('[aria-label="Row 1"]')!;
  const footer = container.querySelector('tfoot [role="row"]')!;
  expect(header).not.toBeNull();
  expect(body).not.toBeNull();
  expect(footer).not.toBeNull();
  return { header: cells(header), body: cells(body), footer: cells(footer) };
}

function expectPinned(cell: HTMLElement, side: "start" | "end", offset: number) {
  expect(cell.style.position).toBe("sticky");
  expect(cell.style[side === "start" ? "insetInlineStart" : "insetInlineEnd"]).toBe(`${offset}px`);
  expect(cell.style.zIndex).toBe("2");
  expect(cell.style.backgroundColor).toBe("var(--color2)");
}

let previousDirection: string | null;
beforeEach(() => {
  previousDirection = document.documentElement.getAttribute("dir");
});
afterEach(() => {
  if (previousDirection === null) {document.documentElement.removeAttribute("dir");}
  else {document.documentElement.setAttribute("dir", previousDirection);}
});

describe.each(["ltr", "rtl"])("footer layout in %s", (direction) => {
  beforeEach(() =>{  document.documentElement.setAttribute("dir", direction); });

  it.each([
    { name: "no auxiliaries", props: {}, leading: 0, trailing: 0 },
    { name: "selection", props: { enableRowSelection: true }, leading: 1, trailing: 0 },
    { name: "row numbers", props: { showRowNumbers: true }, leading: 1, trailing: 0 },
    { name: "expansion", props: { enableRowExpansion: true }, leading: 1, trailing: 0 },
    { name: "delete", props: { showDeleteRow: true }, leading: 0, trailing: 1 },
    { name: "all auxiliaries", props: allAuxiliaries, leading: 3, trailing: 1 },
    {
      name: "read-only auxiliaries",
      props: { ...allAuxiliaries, readOnly: true },
      leading: 3,
      trailing: 0,
    },
    {
      name: "read-only delete suppressed",
      props: { showDeleteRow: true, readOnly: true },
      leading: 0,
      trailing: 0,
    },
    {
      name: "compact auxiliaries",
      props: { ...allAuxiliaries, compact: true },
      leading: 3,
      trailing: 1,
    },
  ])("matches resolved header/body slots with $name", ({ props, leading, trailing }) => {
    const { container } = renderTable(props);
    const row = rows(container);
    const headerWidths = row.header.map(width);
    expect(row.header).toHaveLength(leading + 2 + trailing);
    expect(headerWidths.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(headerWidths.slice(leading, leading + 2)).toEqual([320, 80]);
    expect(row.body.map(width)).toEqual(headerWidths);
    expect(row.footer.map(width)).toEqual(headerWidths);
    expect(row.footer[leading]).toHaveTextContent("Totals");
    expect(row.footer[leading + 1]).toHaveTextContent("10.00");
    const auxiliaryCells = [...row.footer.slice(0, leading), ...row.footer.slice(leading + 2)];
    for (const cell of auxiliaryCells) {
      expect(cell.textContent).toBe("");
      expect(cell.tabIndex).toBe(-1);
      expect(
        cell.querySelector('button, input, [role="button"], [role="checkbox"], [tabindex]'),
      ).toBeNull();
    }
  });

  it.each(["left", "right"] as const)(
    "resolves pinned %s footer paint like header/body",
    async (side) => {
      const utils = renderTable({ enableColumnPinning: true });
      fireEvent.click(utils.getByLabelText("Pin Account column left"));
      if (side === "right") {fireEvent.click(utils.getByLabelText("Pin Account column right"));}
      await waitFor(() =>{ 
        expect(
          (utils.container.querySelector("#account-header") as HTMLElement).style.position,
        ).toBe("sticky"); },
      );
      const row = rows(utils.container);
      const index = row.header.findIndex((cell) => cell.id === "account-header");
      const logicalSide = side === "left" ? "start" : "end";
      expectPinned(row.header[index], logicalSide, 0);
      expectPinned(row.body[index], logicalSide, 0);
      expectPinned(row.footer[index], logicalSide, 0);
      expect(row.footer[1 - index].style.position).not.toBe("sticky");
    },
  );

  it("follows resolved auxiliary widths at small and large preset sizes", () => {
    const widthsBySize = ["small", "large"].map((size) => {
      const utils = renderTable(allAuxiliaries, size as "small" | "large");
      const row = rows(utils.container);
      const headerWidths = row.header.map(width);
      expect(headerWidths).toHaveLength(6);
      expect(headerWidths.slice(3, 5)).toEqual([320, 80]);
      expect(row.body.map(width)).toEqual(headerWidths);
      expect(row.footer.map(width)).toEqual(headerWidths);
      utils.unmount();
      return headerWidths;
    });
    for (const index of [0, 1, 2, 5]) {
      expect(widthsBySize[0][index]).toBeLessThan(widthsBySize[1][index]);
    }
  });

  it.each([false, true])(
    "reserves auxiliary flow around both pin sides, readOnly=%s",
    async (readOnly) => {
      const utils = renderTable({ ...allAuxiliaries, readOnly, enableColumnPinning: true });
      fireEvent.click(utils.getByLabelText("Pin Account column left"));
      fireEvent.click(utils.getByLabelText("Pin Balance column left"));
      fireEvent.click(utils.getByLabelText("Pin Balance column right"));
      await waitFor(() =>{  expect(rows(utils.container).header[3].style.position).toBe("sticky"); });
      const row = rows(utils.container);
      const headerWidths = row.header.map(width);
      const leadingWidth = headerWidths.slice(0, 3).reduce((sum, value) => sum + value, 0);
      const trailingWidth = readOnly ? 0 : headerWidths[5];
      expect(leadingWidth).toBeGreaterThan(0);
      expect(row.body.map(width)).toEqual(headerWidths);
      expect(row.footer.map(width)).toEqual(headerWidths);
      for (const section of [row.header, row.body, row.footer]) {
        expectPinned(section[3], "start", leadingWidth);
        expectPinned(section[4], "end", trailingWidth);
      }
    },
  );

  it("keeps actual virtual rows and auxiliary footer slots aligned after pinned resize", async () => {
    const utils = renderWithProviders(
      <DataTable
        data={[
          { id: "1", rank: 1, label: "Record 1" },
          { id: "2", rank: 2, label: "Record 2" },
        ]}
        columns={[
          { accessorKey: "rank", header: "Rank", size: 48, minSize: 32, maxSize: 64, footer: "2" },
          { accessorKey: "label", header: "Label", size: 320, footer: "Total" },
        ]}
        layout="table"
        columnLayout="scroll"
        enableColumnResizing
        enableColumnPinning
        enableVirtualization
        virtualizationHeight={240}
        enablePagination={false}
        {...allAuxiliaries}
      />,
    );
    const virtualRows = () =>
      utils.container.querySelectorAll('tbody[role="presentation"] [role="rowgroup"] [role="row"]');
    await waitFor(() =>{  expect(virtualRows()).toHaveLength(2); });
    fireEvent.click(utils.getByLabelText("Pin Rank column left"));
    fireEvent.click(utils.getByLabelText("Pin Label column left"));
    const header = () => cells(utils.container.querySelector('thead [role="row"]'));
    const leadingWidth = header()
      .slice(0, 3)
      .reduce((sum, cell) => sum + width(cell), 0);
    expect(width(header()[3])).toBe(48);
    expectPinned(header()[4], "start", leadingWidth + 48);
    const handle = utils.getByRole("separator", { name: "Resize Rank column" });
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 130 });
    fireEvent.mouseUp(document, { clientX: 130 });
    expect(width(header()[3])).toBe(64);
    expectPinned(header()[4], "start", leadingWidth + 64);
    const footer = cells(utils.container.querySelector('tfoot [role="row"]'));
    expect(virtualRows()).toHaveLength(2);
    for (const section of [...virtualRows()].map(cells).concat([footer])) {
      expect(section.map(width)).toEqual(header().map(width));
      expectPinned(section[3], "start", leadingWidth);
      expectPinned(section[4], "start", leadingWidth + 64);
    }
  });
});
