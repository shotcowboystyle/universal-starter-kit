import { renderWithProviders } from '@repo/test-utils';
import { describe, it, expect } from 'vitest';

import { EditorFrame, ToolbarFrame, ToolbarGroupFrame, ToolbarSeparatorFrame, DropdownMenuItemFrame } from './styled';

describe('styled components', () => {
  it('EditorFrame renders with name property', () => {
    const { container } = renderWithProviders(<EditorFrame />);
    expect(container.firstChild).toBeTruthy();
  });

  it('EditorFrame applies hasError variant', () => {
    const { container } = renderWithProviders(<EditorFrame hasError />);
    expect(container.firstChild).toBeTruthy();
  });

  it('ToolbarFrame renders', () => {
    const { container } = renderWithProviders(<ToolbarFrame />);
    expect(container.firstChild).toBeTruthy();
  });

  it('ToolbarGroupFrame, ToolbarSeparatorFrame, and DropdownMenuItemFrame render', () => {
    const { container } = renderWithProviders(
      <>
        <ToolbarGroupFrame />
        <ToolbarSeparatorFrame />
        <DropdownMenuItemFrame />
      </>,
    );
    expect(container.children.length).toBeGreaterThanOrEqual(1);
  });

  it('DropdownMenuItemFrame applies active variant', () => {
    const { container } = renderWithProviders(<DropdownMenuItemFrame active />);
    expect(container.firstChild).toBeTruthy();
  });
});
