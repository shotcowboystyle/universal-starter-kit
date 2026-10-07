/**
 * FileUploadField contract specs. This is the registry adapter behind Frappe's
 * `Attach` and `Attach Image` fieldtypes, so it is the field a DocType actually
 * gets. Three things are its own — everything else it forwards to the forms
 * FileUpload:
 *
 *   1. the choose-from-library tab (MPO-53 AC-11), on by default, which is
 *      what makes this field Attach rather than a plain dropzone,
 *   2. the `isImage` accept default, which is what makes Attach Image narrower
 *      than Attach,
 *   3. a controlled `value` winning over `defaultValue`, so a saved attachment
 *      paints on a re-render instead of the mount-time default.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { FileUploadField } from '.';

afterEach(cleanup);

const nativePicker = (container: HTMLElement) => container.querySelector('input[type="file"]');

describe('FileUploadField library tab', () => {
  it('offers the From Library action by default — this field IS Attach', () => {
    const result = renderWithProviders(<FileUploadField label="Attachment" />);
    expect(result.getButton('From Library')).toBeTruthy();
  });

  it('drops the action when the field opts out', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        library={false}
      />,
    );
    expect(result.getButton('From Library')).toBeUndefined();
  });

  it('disables the action on a disabled field', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        disabled
      />,
    );
    const button = result.getButton('From Library');
    expect(button).toBeTruthy();
    expect(button?.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the action on a read-only field', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        readOnly
      />,
    );
    const button = result.getButton('From Library');
    expect(button).toBeTruthy();
    expect(button?.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('FileUploadField accept', () => {
  it('sends no accept list for a plain Attach', () => {
    const result = renderWithProviders(<FileUploadField label="Attachment" />);
    expect(nativePicker(result.container)?.getAttribute('accept')).toBeNull();
  });

  it('narrows to the image list for Attach Image', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Photo"
        isImage
      />,
    );
    const accept = nativePicker(result.container)?.getAttribute('accept') ?? '';
    expect(accept).toContain('image/png');
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('image/svg+xml');
  });

  it('an explicit accept wins over the isImage default', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Photo"
        isImage
        accept="image/png"
      />,
    );
    expect(nativePicker(result.container)?.getAttribute('accept')).toBe('image/png');
  });
});

describe('FileUploadField chrome', () => {
  it('shows the label and the helperText when the field is clean', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        helperText="under 5MB"
      />,
    );
    expect(result.container.textContent).toContain('Attachment');
    expect(result.container.textContent).toContain('under 5MB');
  });

  it('an error REPLACES the helperText rather than stacking under it', () => {
    // FieldLayout's law, and the reason a field never shows contradictory
    // guidance: one message slot, error wins.
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        helperText="under 5MB"
        error="required"
      />,
    );
    expect(result.container.textContent).toContain('Attachment');
    expect(result.container.textContent).toContain('required');
    expect(result.container.textContent).not.toContain('under 5MB');
  });

  it('skeleton branch renders no picker', () => {
    const result = renderWithProviders(
      <FileUploadField
        label="Attachment"
        skeleton
      />,
    );
    expect(nativePicker(result.container)).toBeNull();
  });
});

describe('registry resolution (Attach / Attach Image fieldtypes)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Attach' to FileUploadField with the library on", () => {
    const Component = getFieldComponent('Attach')!;
    expect(Component).toBeTruthy();
    const element = (Component as Function)(
      propsFor({ value: '/files/a.pdf', label: 'Attachment' }),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(FileUploadField);
    expect(element.props.value).toBe('/files/a.pdf');
    expect(element.props.library).toBe(true);
    expect(element.props.isImage).toBeUndefined();
  });

  it("resolves 'Attach Image' to the same component with isImage set", () => {
    const Component = getFieldComponent('Attach Image')!;
    expect(Component).toBeTruthy();
    expect(Component).not.toBe(getFieldComponent('Attach'));
    const element = (Component as Function)(propsFor({ label: 'Photo' })) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(FileUploadField);
    expect(element.props.isImage).toBe(true);
  });

  it('honours an explicit library:false from the schema', () => {
    const Component = getFieldComponent('Attach')!;
    const element = (Component as Function)(
      propsFor({ library: false } as Partial<FieldRenderProps>),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.library).toBe(false);
  });

  it('feeds the library its file list and folder from the schema', () => {
    const Component = getFieldComponent('Attach')!;
    const libraryFiles = [{ name: 'a.png', file_url: '/files/a.png' }];
    const element = (Component as Function)(
      propsFor({ libraryFiles, libraryFolder: 'Home/Attachments' } as Partial<FieldRenderProps>),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.libraryFiles).toBe(libraryFiles);
    expect(element.props.libraryFolder).toBe('Home/Attachments');
  });

  it('does not coerce a null value — an unset Attach must stay unset', () => {
    const Component = getFieldComponent('Attach')!;
    const element = (Component as Function)(propsFor({ value: null as unknown as string })) as React.ReactElement<
      Record<string, any>
    >;
    expect(element.props.value).toBeNull();
  });

  it('wires the canonical onChange straight through', () => {
    const onChange = vi.fn();
    const Component = getFieldComponent('Attach')!;
    const element = (Component as Function)(propsFor({ onChange })) as React.ReactElement<Record<string, any>>;
    expect(element.props.onChange).toBe(onChange);
  });
});
