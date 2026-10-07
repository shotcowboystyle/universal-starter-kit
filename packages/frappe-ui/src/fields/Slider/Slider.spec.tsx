/**
 * SliderField contract specs. The adapter wraps a scalar number as the
 * forms Slider's `[number]` tuple. Pin that value, onChange, disabled,
 * label and error survive the hop.
 */
import { renderWithProviders } from "@repo/test-utils";
import { cleanup, fireEvent } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';
import { SliderField } from ".";

afterEach(cleanup);

const thumb = (container: HTMLElement) =>
  container.querySelector('[role="slider"]');

describe("SliderField composes the forms Slider", () => {
  it("paints a controlled value onto the thumb", () => {
    const result = renderWithProviders(
      <SliderField label="Volume" value={40} min={0} max={100} onChange={() => {}} />,
    );
    expect(thumb(result.container)?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("emits a scalar through canonical onChange", () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <SliderField label="Volume" value={40} min={0} max={100} step={1} onChange={onChange} />,
    );
    const el = thumb(result.container)! as HTMLInputElement;
    el.focus();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith();
    expect(onChange.mock.calls.at(-1)?.[0]).toBeTypeOf("number");
  });

  it("forwards disabled onto the thumb", () => {
    const result = renderWithProviders(
      <SliderField label="Volume" value={40} disabled onChange={() => {}} />,
    );
    const el = thumb(result.container);
    const disabledMarker =
      (el?.getAttribute("aria-disabled") === "true" ||
        el?.hasAttribute("data-disabled")) ??
      Boolean(el?.closest("[data-disabled]"));
    expect(disabledMarker).toBe(true);
  });

  it("shows the label and error", () => {
    const result = renderWithProviders(
      <SliderField label="Volume" value={40} error="out of range" onChange={() => {}} />,
    );
    expect(result.container.textContent).toContain("Volume");
    expect(result.container.textContent).toContain("out of range");
  });
});

describe("registry resolution (Slider fieldtype)", () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: "", onChange: () => {}, ...overrides };
  }

  it("resolves 'Slider' to SliderField and coerces a non-number to 0", () => {
    const Component = getFieldComponent("Slider")!;
    const element = (Component as Function)(
      propsFor({ value: "nope", label: "Volume" }),
    ) as React.ReactElement<Record<string, unknown>>;
    expect(element.type).toBe(SliderField);
    expect(element.props.value).toBe(0);
    expect(element.props.label).toBe("Volume");
  });
});
