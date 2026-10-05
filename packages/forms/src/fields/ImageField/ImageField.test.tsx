import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import { ImageField } from './index';

afterEach(cleanup);

function mediaTile(container: HTMLElement) {
  return container.querySelector('[data-media-tile]') as HTMLElement | null;
}

function radiusClasses(el: HTMLElement | null) {
  return String(el?.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

describe('ImageField', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<ImageField label="Avatar" name="avatar" />);
      expect(result.findTextElement('Avatar')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<ImageField label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(<ImageField label="Image" name="img" helperText="Upload an image" />);
      expect(result.findTextElement('Upload an image')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<ImageField label="Loading" name="l" skeleton />);
      expect(result.container.querySelector("input[type='file']")).toBeNull();
    });

    it('renders file input for upload', () => {
      const result = renderWithProviders(<ImageField label="Upload" name="u" />);
      const input = result.container.querySelector("input[type='file']");
      expect(input).toBeTruthy();
    });

    it('renders with placeholder text', () => {
      const result = renderWithProviders(<ImageField label="Image" name="img" placeholder="Click to upload" />);
      expect(result.findTextElement('Click to upload')).toBeDefined();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<ImageField label="Disabled" name="d" disabled />);
      expect(result.findTextElement('Disabled')).toBeDefined();
    });

    it('associates the label with the attach frame and is keyboard reachable', () => {
      const result = renderWithProviders(<ImageField label="Avatar" name="avatar" />);
      const label = result.container.querySelector('label[for]') as HTMLLabelElement | null;
      expect(label?.textContent).toContain('Avatar');
      const forId = label?.getAttribute('for') as string;
      const frame = result.container.querySelector(`[id="${forId}"]`) as HTMLElement | null;
      expect(frame?.getAttribute('role')).toBe('button');
      expect(frame?.getAttribute('tabindex')).toBe('0');
    });

    it('does not put the hidden file input in the tab order', () => {
      const result = renderWithProviders(<ImageField label="Avatar" name="avatar" />);
      const input = result.container.querySelector("input[type='file']") as HTMLInputElement | null;
      expect(input?.getAttribute('tabindex')).toBe('-1');
      expect(input?.getAttribute('aria-hidden')).toBe('true');
    });

    it('opens the file dialog from Enter on the frame', async () => {
      const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      const result = renderWithProviders(<ImageField label="Avatar" name="avatar" />);
      const frame = result.container.querySelector('[role="button"]') as HTMLElement | null;
      expect(frame).toBeTruthy();
      await act(async () => {
        if (frame) {
          fireEvent.keyDown(frame, { key: 'Enter' });
        }
      });
      expect(click).toHaveBeenCalled();
      click.mockRestore();
    });

    it('shows a labelled fallback when the attached image fails to load', async () => {
      const result = renderWithProviders(
        <ImageField
          label="Photo"
          name="photo"
          value="https://invalid.invalid/missing.png"
          imageWidth={96}
          imageHeight={96}
        />,
      );
      const img = result.container.querySelector('img') as HTMLImageElement | null;
      expect(img).toBeTruthy();
      await act(async () => {
        if (img) {
          fireEvent.error(img);
        }
      });
      expect(result.findTextElement('Image failed to load')).toBeDefined();
      expect(result.findTextElement('Remove')).toBeDefined();
    });

    it('clears the value from the Remove action', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <ImageField
          label="Photo"
          name="photo"
          value="https://example.com/a.png"
          onChange={onChange}
          imageWidth={96}
          imageHeight={96}
        />,
      );
      const remove = result.findTextElement('Remove');
      expect(remove).toBeDefined();
      await act(async () => {
        if (remove) {
          fireEvent.click(remove);
        }
      });
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('fires canonical onChange and the deprecated onValueChange alias once when an image is chosen', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <ImageField label="Avatar" name="avatar" onChange={onChange} onValueChange={onValueChange} />,
      );

      const input = result.container.querySelector("input[type='file']") as HTMLInputElement | null;
      expect(input).toBeTruthy();
      const file = new File(['fake-image'], 'avatar.png', { type: 'image/png' });
      await act(async () => {
        if (input) {
          fireEvent.change(input, { target: { files: [file] } });
        }
      });

      // Exactly once each — guards against the standalone double-fire bug.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(file);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith(file);
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { avatar: null } }} submitText="Submit">
          <ImageField name="avatar" label="Avatar" />
        </Form>,
      );
      expect(result.findTextElement('Avatar')).toBeDefined();
    });
  });

  describe('live-media tiles', () => {
    it('does not paint a status pip on the media tile', () => {
      const result = renderWithProviders(
        <ImageField label="Photo" name="photo" value="https://example.com/a.png" imageWidth={96} imageHeight={96} />,
      );
      const tile = mediaTile(result.container);
      expect(tile).not.toBeNull();
      expect(tile?.querySelector("[data-status-pip], [data-status-dot], [role='status']")).toBeNull();
    });

    it('keeps Remove as chrome outside the media tile', () => {
      const result = renderWithProviders(
        <ImageField label="Photo" name="photo" value="https://example.com/a.png" imageWidth={96} imageHeight={96} />,
      );
      const tile = mediaTile(result.container);
      expect(tile).not.toBeNull();
      expect(tile?.textContent ?? '').not.toMatch(/Remove/);
      expect(result.findTextElement('Remove')).toBeDefined();
    });

    it('rides the unclamped radius knob including full', () => {
      const none = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <ImageField label="Photo" name="photo" />
        </Preset>,
      );
      expect(radiusClasses(mediaTile(none.container))).toEqual(['_btlr-t-radius-0']);
      cleanup();

      const full = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full' }}>
          <ImageField label="Photo" name="photo" />
        </Preset>,
      );
      expect(radiusClasses(mediaTile(full.container))).toEqual(['_btlr-t-radius-12']);
    });

    it('does not grow a table cell with a Remove sibling', () => {
      const result = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
          <ImageField label="Photo" name="photo" value="https://example.com/a.png" imageWidth={48} imageHeight={48} />
        </TableCellContext.Provider>,
      );
      expect(mediaTile(result.container)).not.toBeNull();
      expect(result.findTextElement('Remove')).toBeFalsy();
    });
  });
});
