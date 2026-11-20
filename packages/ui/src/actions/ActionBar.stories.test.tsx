/**
 * ActionBar was rendered inside DestructiveAction.stories but had no title of
 * its own, so the gallery never listed it. These mount every
 * exported story so an unrenderable one fails here, not in the Kitchen Sink.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import meta, { Alignments, CancelNeverDisabled, Default, WithSecondary } from './ActionBar.stories';

describe('ActionBar stories', () => {
  afterEach(cleanup);

  it('declares the Components/ActionBar title against the component', () => {
    expect(meta.title).toBe('Components/ActionBar');
    expect(meta.component).toBeDefined();
  });

  it('Main renders the cancel and primary slots', () => {
    renderWithProviders(<div>{Default.render?.(Default.args as never, { args: Default.args } as never)}</div>);
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save changes')).toBeTruthy();
  });

  it('Cancel + secondary + primary renders every slot', () => {
    renderWithProviders(<div>{WithSecondary.render?.({} as never, {} as never)}</div>);
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save draft')).toBeTruthy();
    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();
  });

  it('Alignments renders one bar per align value', () => {
    renderWithProviders(<div>{Alignments.render?.({} as never, {} as never)}</div>);
    expect(screen.getAllByText('Confirm')).toHaveLength(3);
    expect(screen.getByText('align="between"')).toBeTruthy();
  });

  it('the cancel-disabled story still paints a reachable cancel', () => {
    renderWithProviders(<div>{CancelNeverDisabled.render?.({} as never, {} as never)}</div>);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
